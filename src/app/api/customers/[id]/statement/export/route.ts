import ExcelJS from "exceljs"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export const runtime = "nodejs"

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const companyId = (session?.user as { companyId?: string } | undefined)?.companyId
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const from = parseDate(req.nextUrl.searchParams.get("from")) ?? defaultFrom
  const to = parseDate(req.nextUrl.searchParams.get("to"), true) ?? now
  if (from > to) return NextResponse.json({ error: "Invalid date range" }, { status: 400 })

  const customer = await db.customer.findFirst({
    where: { id, companyId },
    select: { name: true, openingBalance: true },
  })
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })

  const [previousInvoices, previousReturns, invoices, payments, returns] = await Promise.all([
    db.saleInvoice.aggregate({ where: { customerId: id, companyId, invoiceDate: { lt: from } }, _sum: { netAmount: true, paidAmount: true } }),
    db.saleReturn.aggregate({ where: { customerId: id, companyId, returnDate: { lt: from } }, _sum: { totalAmount: true } }),
    db.saleInvoice.findMany({ where: { customerId: id, companyId, invoiceDate: { gte: from, lte: to } }, select: { invoiceNumber: true, invoiceDate: true, netAmount: true }, orderBy: { invoiceDate: "asc" } }),
    db.customerPayment.findMany({ where: { customerId: id, companyId, paymentDate: { gte: from, lte: to } }, select: { paymentDate: true, amount: true, paymentMode: true, reference: true, invoice: { select: { invoiceNumber: true } } }, orderBy: { paymentDate: "asc" } }),
    db.saleReturn.findMany({ where: { customerId: id, companyId, returnDate: { gte: from, lte: to } }, select: { returnNumber: true, returnDate: true, totalAmount: true }, orderBy: { returnDate: "asc" } }),
  ])

  let balance = parseFloat(customer.openingBalance.toString()) + parseFloat(previousInvoices._sum.netAmount?.toString() ?? "0") - parseFloat(previousInvoices._sum.paidAmount?.toString() ?? "0") - parseFloat(previousReturns._sum.totalAmount?.toString() ?? "0")
  const rows = [
    ...invoices.map((item) => ({ date: item.invoiceDate, description: `Invoice ${item.invoiceNumber}`, debit: parseFloat(item.netAmount.toString()), credit: 0 })),
    ...payments.map((item) => ({ date: item.paymentDate, description: `Payment${item.invoice ? ` (${item.invoice.invoiceNumber})` : ""} — ${item.paymentMode}${item.reference ? ` #${item.reference}` : ""}`, debit: 0, credit: parseFloat(item.amount.toString()) })),
    ...returns.map((item) => ({ date: item.returnDate, description: `Return ${item.returnNumber}`, debit: 0, credit: parseFloat(item.totalAmount.toString()) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Customer Ledger")
  sheet.addRow(["Customer Ledger"])
  sheet.getCell("A1").font = { bold: true, size: 14 }
  sheet.addRow([customer.name])
  sheet.addRow([`Period: ${from.toLocaleDateString("en-GB")} - ${to.toLocaleDateString("en-GB")}`])
  sheet.addRow([])
  const header = sheet.addRow(["Date", "Description", "Debit", "Credit", "Balance"])
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } } })
  sheet.addRow([from, "Balance Brought Forward", 0, 0, balance])
  for (const row of rows) {
    balance += row.debit - row.credit
    sheet.addRow([row.date, row.description, row.debit, row.credit, balance])
  }
  sheet.columns = [{ width: 14 }, { width: 48 }, { width: 16 }, { width: 16 }, { width: 16 }]
  for (const column of [1]) sheet.getColumn(column).numFmt = "dd-mmm-yyyy"
  for (const column of [3, 4, 5]) sheet.getColumn(column).numFmt = '#,##0.00'

  const filename = `${customer.name.replace(/[^a-z0-9]+/gi, "-")}-ledger.xlsx`
  return new NextResponse(new Uint8Array(await workbook.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } })
}

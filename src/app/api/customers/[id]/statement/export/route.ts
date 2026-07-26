import ExcelJS from "exceljs"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { buildCustomerLedger } from "@/lib/customer-ledger"

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

  const [invoices, payments, returns] = await Promise.all([
    db.saleInvoice.findMany({ where: { customerId: id, companyId }, select: { id: true, invoiceNumber: true, invoiceDate: true, netAmount: true, paidAmount: true, schemeNotes: true }, orderBy: { invoiceDate: "asc" } }),
    db.customerPayment.findMany({ where: { customerId: id, companyId }, select: { invoiceId: true, paymentDate: true, amount: true, paymentMode: true, reference: true, invoice: { select: { invoiceNumber: true } } }, orderBy: { paymentDate: "asc" } }),
    db.saleReturn.findMany({ where: { customerId: id, companyId }, select: { returnNumber: true, returnDate: true, totalAmount: true, notes: true }, orderBy: { returnDate: "asc" } }),
  ])

  const ledger = buildCustomerLedger({
    customerOpeningBalance: customer.openingBalance,
    fromDate: from,
    toDate: to,
    invoices,
    payments,
    returns,
  })

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Customer Ledger")
  sheet.addRow(["Customer Ledger"])
  sheet.getCell("A1").font = { bold: true, size: 14 }
  sheet.addRow(["Customer", customer.name])
  sheet.addRow(["Report period", `${from.toLocaleDateString("en-GB")} - ${to.toLocaleDateString("en-GB")}`])
  sheet.addRow([])
  const header = sheet.addRow(["Date", "Type", "Description", "Debit", "Credit", "Running Balance"])
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } } })
  const openingRow = sheet.addRow([from, "Opening Balance", "Balance Brought Forward", 0, 0, ledger.openingBalance])
  openingRow.font = { italic: true }
  for (const row of ledger.rows) {
    sheet.addRow([row.date, row.debit ? "Invoice" : "Credit", row.description, row.debit, row.credit, row.balance])
  }
  const closingRow = sheet.addRow([to, "Closing Balance", "Balance Carried Forward", 0, 0, ledger.closingBalance])
  closingRow.font = { bold: true }
  closingRow.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FD" } } })

  sheet.columns = [{ width: 14 }, { width: 18 }, { width: 48 }, { width: 16 }, { width: 16 }, { width: 18 }]
  for (const column of [1]) sheet.getColumn(column).numFmt = "dd-mmm-yyyy"
  for (const column of [4, 5, 6]) sheet.getColumn(column).numFmt = '#,##0.00'

  const filename = `${customer.name.replace(/[^a-z0-9]+/gi, "-")}-ledger.xlsx`
  return new NextResponse(new Uint8Array(await workbook.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } })
}

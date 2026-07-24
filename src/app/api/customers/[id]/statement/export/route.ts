import ExcelJS from "exceljs"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export const runtime = "nodejs"

function toNumber(value: { toString(): string } | null | undefined) {
  return Number(value?.toString() ?? 0)
}

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null

  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function filenameFor(name: string) {
  const safeName = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "customer"
  return `${safeName.toLowerCase()}-ledger.xlsx`
}

export async function GET(request: NextRequest, context: RouteContext<"/api/customers/[id]/statement/export">) {
  const session = await getServerSession(authOptions)
  const companyId = (session?.user as { companyId?: string } | undefined)?.companyId
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const from = parseDate(request.nextUrl.searchParams.get("from")) ?? defaultFrom
  const to = parseDate(request.nextUrl.searchParams.get("to"), true) ?? now

  if (from > to) {
    return NextResponse.json({ error: "The start date must not be after the end date." }, { status: 400 })
  }

  const customer = await db.customer.findFirst({
    where: { id, companyId },
    select: { name: true, openingBalance: true },
  })
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })

  const [previousInvoices, previousReturns, invoices, payments, returns] = await Promise.all([
    db.saleInvoice.aggregate({
      where: { customerId: id, companyId, invoiceDate: { lt: from } },
      _sum: { netAmount: true, paidAmount: true },
    }),
    db.saleReturn.aggregate({
      where: { customerId: id, companyId, returnDate: { lt: from } },
      _sum: { totalAmount: true },
    }),
    db.saleInvoice.findMany({
      where: { customerId: id, companyId, invoiceDate: { gte: from, lte: to } },
      select: { invoiceNumber: true, invoiceDate: true, netAmount: true },
    }),
    db.customerPayment.findMany({
      where: { customerId: id, companyId, paymentDate: { gte: from, lte: to } },
      select: { paymentDate: true, amount: true, paymentMode: true, reference: true, invoice: { select: { invoiceNumber: true } } },
    }),
    db.saleReturn.findMany({
      where: { customerId: id, companyId, returnDate: { gte: from, lte: to } },
      select: { returnNumber: true, returnDate: true, totalAmount: true },
    }),
  ])

  let balance =
    toNumber(customer.openingBalance) +
    toNumber(previousInvoices._sum.netAmount) -
    toNumber(previousInvoices._sum.paidAmount) -
    toNumber(previousReturns._sum.totalAmount)

  const rows = [
    ...invoices.map((invoice) => ({
      date: invoice.invoiceDate,
      description: `Invoice ${invoice.invoiceNumber}`,
      debit: toNumber(invoice.netAmount),
      credit: 0,
    })),
    ...payments.map((payment) => ({
      date: payment.paymentDate,
      description: `Payment${payment.invoice ? ` (against ${payment.invoice.invoiceNumber})` : ""} — ${payment.paymentMode}${payment.reference ? ` #${payment.reference}` : ""}`,
      debit: 0,
      credit: toNumber(payment.amount),
    })),
    ...returns.map((saleReturn) => ({
      date: saleReturn.returnDate,
      description: `Return ${saleReturn.returnNumber}`,
      debit: 0,
      credit: toNumber(saleReturn.totalAmount),
    })),
  ].sort((left, right) => left.date.getTime() - right.date.getTime())

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Poultry POS System"
  const worksheet = workbook.addWorksheet("Customer Ledger")
  worksheet.columns = [
    { width: 14 },
    { width: 52 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ]

  worksheet.addRow(["Customer Ledger"])
  worksheet.getCell("A1").font = { bold: true, size: 14 }
  worksheet.addRow([customer.name])
  worksheet.addRow([`Period: ${from.toLocaleDateString("en-GB")} – ${to.toLocaleDateString("en-GB")}`])
  worksheet.addRow([])

  const heading = worksheet.addRow(["Date", "Description", "Debit", "Credit", "Balance"])
  heading.font = { bold: true, color: { argb: "FFFFFFFF" } }
  heading.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } }
  })

  worksheet.addRow([from, "Balance Brought Forward", 0, 0, balance])
  for (const row of rows) {
    balance += row.debit - row.credit
    worksheet.addRow([row.date, row.description, row.debit, row.credit, balance])
  }

  worksheet.getColumn(1).numFmt = "dd-mmm-yyyy"
  for (const column of [3, 4, 5]) worksheet.getColumn(column).numFmt = "#,##0.00"
  worksheet.views = [{ state: "frozen", ySplit: 5 }]

  const spreadsheet = await workbook.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(spreadsheet), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filenameFor(customer.name)}"`,
    },
  })
}

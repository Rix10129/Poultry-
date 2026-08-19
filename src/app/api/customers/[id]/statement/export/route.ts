import ExcelJS from "exceljs"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { buildCustomerLedger, parseOpeningBalanceCorrections } from "@/lib/customer-ledger"
import { buildWideTablePdf, type WideTableColumn } from "@/lib/wide-table-pdf"
import { authorize } from "@/lib/authorization"
import { formatCurrency, formatDate } from "@/lib/utils"

export const runtime = "nodejs"

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorize("EXPORT_DATA")
  if (!authorization.ok) return NextResponse.json({ error: "Unauthorized" }, { status: authorization.status })
  const companyId = authorization.actor.companyId

  const { id } = await params
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const from = parseDate(req.nextUrl.searchParams.get("from")) ?? defaultFrom
  const to = parseDate(req.nextUrl.searchParams.get("to"), true) ?? now
  if (from > to) return NextResponse.json({ error: "Invalid date range" }, { status: 400 })

  const customer = await db.customer.findFirst({
    where: { id, companyId },
    select: { name: true, openingBalance: true, createdAt: true },
  })
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })

  const [invoices, payments, returns, correctionLogs] = await Promise.all([
    db.saleInvoice.findMany({
      where: { customerId: id, companyId, status: "POSTED" },
      select: {
        id: true, invoiceNumber: true, invoiceDate: true, netAmount: true, schemeNotes: true,
        items: { select: { quantity: true, salePrice: true, isBonus: true, product: { select: { name: true } } } },
      },
      orderBy: { invoiceDate: "asc" },
    }),
    db.customerPayment.findMany({ where: { customerId: id, companyId, status: "POSTED" }, select: { invoiceId: true, paymentDate: true, amount: true, discountAmount: true, paymentMode: true, reference: true, notes: true, invoice: { select: { invoiceNumber: true } } }, orderBy: { paymentDate: "asc" } }),
    db.saleReturn.findMany({ where: { customerId: id, companyId, status: "POSTED" }, select: { returnNumber: true, returnDate: true, totalAmount: true, notes: true }, orderBy: { returnDate: "asc" } }),
    db.auditLog.findMany({
      where: { companyId, entity: "Customer", entityId: id, action: "UPDATE_OPENING_BALANCE" },
      select: { detail: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const ledger = buildCustomerLedger({
    customerOpeningBalance: customer.openingBalance,
    corrections: parseOpeningBalanceCorrections(correctionLogs),
    fromDate: from,
    toDate: to,
    invoices: invoices.map((invoice) => ({
      ...invoice,
      items: invoice.items.map((item) => ({ productName: item.product.name, quantity: item.quantity, salePrice: item.salePrice, isBonus: item.isBonus })),
    })),
    payments,
    returns,
  })

  if (req.nextUrl.searchParams.get("format") === "pdf") {
    const rows = [{ date: from.toISOString().slice(0, 10), description: "Balance Brought Forward", debit: 0, credit: 0, balance: ledger.openingBalance }, ...ledger.rows.map(row => ({ date: row.date.toISOString().slice(0, 10), description: row.description, debit: row.debit, credit: row.credit, balance: row.balance }))]
    const pdfColumns: WideTableColumn[] = [
      { header: "Date", key: "date", weight: 8 }, { header: "Description", key: "description", weight: 22 },
      { header: "Debit", key: "debit", weight: 9, align: "right" }, { header: "Credit", key: "credit", weight: 9, align: "right" },
      { header: "Balance", key: "balance", weight: 10, align: "right" },
    ]
    const pdfRows = rows.map((r) => ({
      date: formatDate(r.date), description: r.description,
      debit: r.debit ? formatCurrency(r.debit) : "—", credit: r.credit ? formatCurrency(r.credit) : "—", balance: formatCurrency(r.balance),
    }))
    const totalsRow = {
      date: formatDate(to), description: "Balance Carried Forward", debit: "", credit: "", balance: formatCurrency(ledger.closingBalance),
    }
    const pdfBytes = await buildWideTablePdf({
      title: `${customer.name} — Customer Statement`, subtitle: `${formatDate(from)} to ${formatDate(to)}`,
      columns: pdfColumns, rows: pdfRows, totalsRow, orientation: "portrait",
    })
    return new Response(new Uint8Array(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${customer.name.replace(/[^a-z0-9]+/gi, "-")}-ledger.pdf"` },
    })
  }

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
  sheet.getColumn(3).alignment = { wrapText: true, vertical: "top" }

  const filename = `${customer.name.replace(/[^a-z0-9]+/gi, "-")}-ledger.xlsx`
  return new NextResponse(new Uint8Array(await workbook.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } })
}

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function parseFrom(value: string | null) { return value ? new Date(`${value}T00:00:00`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
function parseTo(value: string | null) { return value ? new Date(`${value}T23:59:59`) : new Date(`${isoDate(new Date())}T23:59:59`) }
function fmtDate(d: Date) { return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) }
function num(value: { toString(): string } | number | null | undefined) { return parseFloat(value?.toString() ?? "0") }
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100 }
function balanceText(value: number) {
  if (Math.abs(value) < 0.01) return "SETTLED"
  return `${money(Math.abs(value))} ${value > 0 ? "Dr" : "Cr"}`
}
function filenameSafe(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "customer"
}

async function exportCustomerLedger(companyId: string, companyName: string, req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get("customerId")
  if (!customerId) return NextResponse.json({ error: "customerId is required" }, { status: 400 })

  const fromDate = parseFrom(searchParams.get("from"))
  const toDate = parseTo(searchParams.get("to"))
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 })
  }

  const customer = await db.customer.findFirst({
    where: { id: customerId, companyId },
    select: { id: true, name: true, phone: true, address: true, area: true },
  })
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })

  const [prevInvAgg, prevReturnsAgg, invoices, payments, returns] = await Promise.all([
    db.saleInvoice.aggregate({
      where: { customerId, companyId, invoiceDate: { lt: fromDate } },
      _sum: { netAmount: true, paidAmount: true },
    }),
    db.saleReturn.aggregate({
      where: { customerId, companyId, returnDate: { lt: fromDate } },
      _sum: { totalAmount: true },
    }),
    db.saleInvoice.findMany({
      where: { customerId, companyId, invoiceDate: { gte: fromDate, lte: toDate } },
      select: { invoiceNumber: true, invoiceDate: true, netAmount: true, schemeNotes: true },
      orderBy: { invoiceDate: "asc" },
    }),
    db.customerPayment.findMany({
      where: { customerId, companyId, paymentDate: { gte: fromDate, lte: toDate } },
      select: { paymentDate: true, amount: true, paymentMode: true, reference: true, invoice: { select: { invoiceNumber: true } } },
      orderBy: { paymentDate: "asc" },
    }),
    db.saleReturn.findMany({
      where: { customerId, companyId, returnDate: { gte: fromDate, lte: toDate } },
      select: { returnNumber: true, returnDate: true, totalAmount: true, notes: true },
      orderBy: { returnDate: "asc" },
    }),
  ])

  const openingBalance = num(prevInvAgg._sum.netAmount) - num(prevInvAgg._sum.paidAmount) - num(prevReturnsAgg._sum.totalAmount)
  type ExportLedgerRow = { date: Date; description: string; debit: number; credit: number }
  const ledger: ExportLedgerRow[] = [
    ...invoices.map((inv: { invoiceDate: Date; invoiceNumber: string; schemeNotes?: string | null; netAmount: { toString(): string } }) => ({ date: inv.invoiceDate, description: `Invoice ${inv.invoiceNumber}${inv.schemeNotes ? ` — Scheme: ${inv.schemeNotes}` : ""}`, debit: num(inv.netAmount), credit: 0 })),
    ...payments.map((p: { paymentDate: Date; amount: { toString(): string }; paymentMode: string; reference?: string | null; invoice?: { invoiceNumber: string } | null }) => ({ date: p.paymentDate, description: `Payment${p.invoice ? ` (vs. ${p.invoice.invoiceNumber})` : ""} — ${p.paymentMode}${p.reference ? ` #${p.reference}` : ""}`, debit: 0, credit: num(p.amount) })),
    ...returns.map((r: { returnDate: Date; returnNumber: string; totalAmount: { toString(): string }; notes?: string | null }) => ({ date: r.returnDate, description: `Return ${r.returnNumber}${r.notes ? ` — ${r.notes}` : ""}`, debit: 0, credit: num(r.totalAmount) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  let running = openingBalance
  const totalDebit = ledger.reduce((s, r) => s + r.debit, 0)
  const totalCredit = ledger.reduce((s, r) => s + r.credit, 0)

  const wb = new ExcelJS.Workbook()
  wb.creator = "Poultry Vet System"
  wb.created = new Date()
  const sheet = wb.addWorksheet("Customer Ledger")
  sheet.addRows([
    [companyName],
    ["Customer Ledger Statement"],
    [`Customer: ${customer.name}`],
    [`Period: ${fmtDate(fromDate)} – ${fmtDate(toDate)}`],
    [`Generated: ${fmtDate(new Date())}`],
    [],
    ["Date", "Description", "Debit (Dr)", "Credit (Cr)", "Running Balance"],
    [fmtDate(fromDate), "Opening Balance", "", "", balanceText(openingBalance)],
  ])
  sheet.getRow(1).font = { bold: true, size: 16 }
  sheet.getRow(2).font = { italic: true, size: 12 }
  sheet.getRow(7).font = { bold: true, color: { argb: "FFFFFFFF" } }
  sheet.getRow(7).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } } })

  ledger.forEach((row) => {
    running += row.debit - row.credit
    sheet.addRow([fmtDate(row.date), row.description, row.debit || "", row.credit || "", balanceText(running)])
  })
  sheet.addRow([])
  const totalRow = sheet.addRow(["", "Period Totals", money(totalDebit), money(totalCredit), balanceText(running)])
  totalRow.font = { bold: true }
  const closingRow = sheet.addRow(["", "Closing Balance", "", "", balanceText(running)])
  closingRow.font = { bold: true }

  sheet.columns = [{ width: 14 }, { width: 52 }, { width: 14 }, { width: 14 }, { width: 18 }]
  ;[3, 4].forEach((col) => { sheet.getColumn(col).numFmt = '#,##0.00' })
  sheet.eachRow((row) => row.eachCell((cell) => { cell.alignment = { vertical: "middle", wrapText: true } }))

  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  const filename = `customer-ledger-${filenameSafe(customer.name)}-${isoDate(fromDate)}-to-${isoDate(toDate)}.xlsx`
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = session?.user as { companyId?: string; companyName?: string; role?: string } | undefined
  if (!actor?.companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const companyId = actor.companyId as string
  const companyName = (actor.companyName as string | undefined) ?? "Our Company"
  const { searchParams } = new URL(req.url)
  if (searchParams.get("type") === "customer-ledger") {
    return exportCustomerLedger(companyId, companyName, req)
  }

  if (actor.role !== "OWNER") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 })
  }

  const [company, customers, suppliers, products, invoices, purchases, expenses, payments] =
    await Promise.all([
      db.company.findUnique({
        where: { id: companyId },
        select: { name: true, phone: true, email: true, address: true, currency: true },
      }),
      db.customer.findMany({ where: { companyId } }),
      db.supplier.findMany({ where: { companyId } }),
      db.product.findMany({
        where: { companyId },
        include: { batches: { select: { batchNumber: true, quantity: true, expiryDate: true, purchasePrice: true } } },
      }),
      db.saleInvoice.findMany({
        where: { companyId },
        include: { items: { select: { quantity: true, salePrice: true, totalAmount: true, product: { select: { name: true } } } } },
        orderBy: { invoiceDate: "desc" },
      }),
      db.purchaseOrder.findMany({
        where: { companyId },
        include: { items: { select: { quantity: true, purchasePrice: true, product: { select: { name: true } } } } },
        orderBy: { orderDate: "desc" },
      }),
      db.expense.findMany({ where: { companyId }, orderBy: { expenseDate: "desc" } }),
      db.customerPayment.findMany({ where: { companyId }, orderBy: { paymentDate: "desc" } }),
    ])

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    company,
    customers,
    suppliers,
    products,
    invoices,
    purchases,
    expenses,
    payments,
  }

  const dateStr = new Date().toISOString().split("T")[0]

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="poultry-export-${dateStr}.json"`,
    },
  })
}

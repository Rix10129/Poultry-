import ExcelJS from "exceljs"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

type Row = Record<string, string | number | null>

const REPORT_TITLES: Record<string, string> = {
  sales: "Sales Report",
  stock: "Stock Valuation",
  recovery: "Customer Recovery",
  aging: "Aging Report",
  "trial-balance": "Trial Balance",
  collection: "Collection Report",
  purchases: "Purchase Report",
  pl: "Profit and Loss Statement",
  "balance-sheet": "Balance Sheet",
}

function money(value: unknown) {
  return Number.parseFloat(String(value ?? 0))
}

function dateOnly(value: Date | string | null | undefined) {
  if (!value) return ""
  return new Date(value).toISOString().slice(0, 10)
}

function csv(rows: Row[]) {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
  return [headers.map(escape).join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n")
}

async function buildRows(report: string, companyId: string, params: URLSearchParams): Promise<Row[]> {
  const from = params.get("from")
  const to = params.get("to")
  const fromDate = from ? new Date(from) : undefined
  const toDate = to ? new Date(`${to}T23:59:59`) : undefined

  if (report === "sales") {
    const type = params.get("type")
    const rows: any[] = await db.saleInvoice.findMany({
      where: { companyId, ...(fromDate || toDate ? { invoiceDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}), ...(type === "WALK_IN" ? { customerId: null } : type ? { customer: { type: type as any } } : {}) },
      include: { customer: { select: { name: true, type: true } }, user: { select: { name: true } } },
      orderBy: { invoiceDate: "desc" },
    })
    return rows.map((i) => ({ Invoice: i.invoiceNumber, Date: dateOnly(i.invoiceDate), Customer: i.customer?.name ?? "Walk-in", Type: i.customer?.type ?? "WALK_IN", Salesperson: i.user?.name ?? "", Net: money(i.netAmount), Paid: money(i.paidAmount), Outstanding: money(i.netAmount) - money(i.paidAmount) }))
  }

  if (report === "purchases") {
    const supplierId = params.get("supplierId")
    const rows: any[] = await db.purchaseOrder.findMany({
      where: { companyId, ...(fromDate || toDate ? { orderDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}), ...(supplierId ? { supplierId } : {}) },
      include: { supplier: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { orderDate: "desc" },
    })
    return rows.map((o) => ({ Order: o.orderNumber, Date: dateOnly(o.orderDate), Supplier: o.supplier.name, User: o.user?.name ?? "", Net: money(o.netAmount), Paid: money(o.paidAmount), Outstanding: money(o.netAmount) - money(o.paidAmount) }))
  }

  if (report === "stock") {
    const categoryId = params.get("categoryId")
    const species = params.get("species")
    const showZero = params.get("zero") === "1"
    const products: any[] = await db.product.findMany({ where: { companyId, isActive: true, ...(categoryId ? { categoryId } : {}), ...(species ? { species: species as any } : {}) }, include: { category: { select: { name: true } }, batches: { where: showZero ? {} : { quantity: { gt: 0 } }, select: { batchNumber: true, expiryDate: true, quantity: true, purchasePrice: true, salePrice: true } } }, orderBy: { name: "asc" } })
    return products.flatMap((p) => p.batches.map((b: any) => ({ Product: p.name, Category: p.category?.name ?? "", Species: p.species, Batch: b.batchNumber, Expiry: dateOnly(b.expiryDate), Quantity: b.quantity, "Purchase Value": b.quantity * money(b.purchasePrice), "Sale Value": b.quantity * money(b.salePrice) })))
  }

  if (report === "recovery") {
    const type = params.get("type")
    const area = params.get("area")
    const showAll = params.get("all") === "1"
    const customers: any[] = await db.customer.findMany({ where: { companyId, ...(type ? { type: type as any } : {}), ...(area ? { area: { contains: area, mode: "insensitive" } } : {}) }, include: { invoices: { select: { netAmount: true, paidAmount: true } } }, orderBy: { name: "asc" } })
    return customers.map((c) => { const invoiced = c.invoices.reduce((s: number, i: any) => s + money(i.netAmount), 0); const paid = c.invoices.reduce((s: number, i: any) => s + money(i.paidAmount), 0); const outstanding = money(c.openingBalance) + invoiced - paid; return { Customer: c.name, Type: c.type, Area: c.area ?? "", Opening: money(c.openingBalance), Invoiced: invoiced, Paid: paid, Outstanding: outstanding } }).filter((r) => showAll || Number(r.Outstanding) > 0.001)
  }

  if (report === "aging") {
    const invoices: any[] = await db.saleInvoice.findMany({ where: { companyId, customer: { isNot: null } }, select: { invoiceNumber: true, invoiceDate: true, dueDate: true, netAmount: true, paidAmount: true, customer: { select: { name: true, area: true } } }, orderBy: { invoiceDate: "asc" } })
    const today = new Date(); today.setHours(23, 59, 59, 999)
    return invoices.map((i) => ({ Invoice: i.invoiceNumber, Customer: i.customer?.name ?? "", Area: i.customer?.area ?? "", Date: dateOnly(i.invoiceDate), Due: dateOnly(i.dueDate), Age: Math.floor((today.getTime() - (i.dueDate ?? i.invoiceDate).getTime()) / 86400000), Outstanding: money(i.netAmount) - money(i.paidAmount) })).filter((r) => Number(r.Outstanding) > 0.01)
  }

  if (report === "collection") {
    const now = new Date(); const start = fromDate ?? new Date(now.getFullYear(), now.getMonth(), 1); const end = toDate ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const payments: any[] = await db.customerPayment.findMany({ where: { companyId, paymentDate: { gte: start, lte: end } }, include: { customer: { select: { name: true, area: true } }, invoice: { select: { invoiceNumber: true, user: { select: { name: true } } } } }, orderBy: { paymentDate: "asc" } })
    return payments.map((p) => ({ Date: dateOnly(p.paymentDate), Customer: p.customer.name, Area: p.customer.area ?? "", Invoice: p.invoice?.invoiceNumber ?? "Direct", Salesperson: p.invoice?.user?.name ?? "Direct / Walk-in", Amount: money(p.amount), Method: p.method, Reference: p.reference ?? "" }))
  }

  if (report === "trial-balance") {
    const showZero = params.get("zero") === "1"
    const accounts: any[] = await db.account.findMany({ where: { companyId }, include: { debitLines: { select: { amount: true } }, creditLines: { select: { amount: true } } }, orderBy: [{ type: "asc" }, { code: "asc" }] })
    return accounts.map((a) => { const debit = a.debitLines.reduce((s: number, l: any) => s + money(l.amount), 0); const credit = a.creditLines.reduce((s: number, l: any) => s + money(l.amount), 0); return { Code: a.code, Account: a.name, Type: a.type, Debit: debit, Credit: credit, Net: debit - credit } }).filter((r) => showZero || Number(r.Debit) > 0 || Number(r.Credit) > 0)
  }

  if (report === "pl") {
    const now = new Date()
    const start = fromDate ?? new Date(now.getFullYear(), now.getMonth(), 1)
    const end = toDate ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const [salesAgg, invoiceItems, expenseGroups]: any[] = await Promise.all([
      db.saleInvoice.aggregate({ where: { companyId, invoiceDate: { gte: start, lte: end } }, _sum: { netAmount: true, taxAmount: true, discountAmount: true }, _count: true }),
      db.saleInvoiceItem.findMany({ where: { invoice: { companyId, invoiceDate: { gte: start, lte: end } } }, select: { quantity: true, batch: { select: { purchasePrice: true } } } }),
      db.expense.groupBy({ by: ["category"], where: { companyId, expenseDate: { gte: start, lte: end } }, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } } }),
    ])
    const revenue = money(salesAgg._sum.netAmount)
    const cogs = invoiceItems.reduce((sum: number, item: any) => sum + item.quantity * money(item.batch.purchasePrice), 0)
    const expenses = expenseGroups.reduce((sum: number, group: any) => sum + money(group._sum.amount), 0)
    return [
      { Metric: "From", Value: dateOnly(start) },
      { Metric: "To", Value: dateOnly(end) },
      { Metric: "Invoice Count", Value: salesAgg._count },
      { Metric: "Revenue", Value: revenue },
      { Metric: "COGS", Value: cogs },
      { Metric: "Gross Profit", Value: revenue - cogs },
      { Metric: "Expenses", Value: expenses },
      { Metric: "Net Profit", Value: revenue - cogs - expenses },
      ...expenseGroups.map((group: any) => ({ Metric: `Expense - ${group.category}`, Value: money(group._sum.amount) })),
    ]
  }

  if (report === "balance-sheet") {
    const [inventoryBatches, customers, suppliers]: any[] = await Promise.all([
      db.productBatch.findMany({ where: { companyId, quantity: { gt: 0 } }, select: { quantity: true, purchasePrice: true } }),
      db.customer.findMany({ where: { companyId }, select: { openingBalance: true, invoices: { select: { netAmount: true, paidAmount: true } } } }),
      db.supplier.findMany({ where: { companyId }, select: { openingBalance: true, purchases: { select: { netAmount: true, paidAmount: true } } } }),
    ])
    const inventoryValue = inventoryBatches.reduce((sum: number, batch: any) => sum + batch.quantity * money(batch.purchasePrice), 0)
    const receivable = customers.reduce((total: number, customer: any) => total + Math.max(0, money(customer.openingBalance) + customer.invoices.reduce((sum: number, invoice: any) => sum + money(invoice.netAmount) - money(invoice.paidAmount), 0)), 0)
    const payable = suppliers.reduce((total: number, supplier: any) => total + Math.max(0, money(supplier.openingBalance) + supplier.purchases.reduce((sum: number, purchase: any) => sum + money(purchase.netAmount) - money(purchase.paidAmount), 0)), 0)
    return [
      { Section: "Assets", Account: "Inventory", Amount: inventoryValue },
      { Section: "Assets", Account: "Accounts Receivable", Amount: receivable },
      { Section: "Assets", Account: "Total Current Assets", Amount: inventoryValue + receivable },
      { Section: "Liabilities", Account: "Accounts Payable", Amount: payable },
      { Section: "Equity", Account: "Owner Equity", Amount: inventoryValue + receivable - payable },
    ]
  }

  throw new Error("Unknown report")
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const companyId = (session.user as any).companyId as string
  const report = req.nextUrl.searchParams.get("report") ?? ""
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx"
  if (!REPORT_TITLES[report]) return NextResponse.json({ error: "Unknown report" }, { status: 400 })

  const rows = await buildRows(report, companyId, req.nextUrl.searchParams)
  const filename = `${report}-${new Date().toISOString().slice(0, 10)}.${format}`

  if (format === "csv") {
    return new NextResponse(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` } })
  }

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(REPORT_TITLES[report])
  sheet.addRow(Object.keys(rows[0] ?? { Report: "", Note: "" }))
  for (const row of rows) sheet.addRow(Object.values(row))
  sheet.getRow(1).font = { bold: true }
  sheet.columns.forEach((column) => { column.width = 18 })
  const buffer = await workbook.xlsx.writeBuffer()
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } })
}

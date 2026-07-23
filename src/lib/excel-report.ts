import ExcelJS from "exceljs"
import { db } from "@/lib/db"

const NAVY = "FF1E3A5F"
const WHITE = "FFFFFFFF"
const STRIPE = "FFF8FAFC"
const TOTAL_BG = "FFE8F4FD"
const RED = "FFDC2626"
const MUTED = "FF64748B"
const GREEN = "FF16A34A"
const AMBER = "FFCA8A04"

export const REPORT_TYPES = [
  "sales",
  "stock",
  "customer-ledger",
  "recovery",
  "trial-balance",
  "purchase",
  "pl",
  "balance-sheet",
] as const

export type ReportType = (typeof REPORT_TYPES)[number]

export type ReportFilters = {
  from: Date
  to: Date
  customerId?: string
  supplierId?: string
  productId?: string
  salesmanId?: string
  routeId?: string
  status?: string
}

type Moneyish = { toString(): string }
type QueryWhere = Record<string, unknown>

type WorkbookInput = {
  companyId: string
  companyName: string
  filters: ReportFilters
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function toMoney(value: Moneyish | number | null | undefined) {
  if (value == null) return 0
  return typeof value === "number" ? value : parseFloat(value.toString())
}

function statusFromAmounts(net: number, paid: number) {
  const balance = net - paid
  return balance <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID"
}

function matchesStatus(statusFilter: string | undefined, status: string) {
  return !statusFilter || statusFilter.toUpperCase() === status.toUpperCase()
}

function createWorkbook() {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Poultry Vet System"
  wb.created = new Date()
  return wb
}

function addTitleRow(sheet: ExcelJS.Worksheet, company: string, title: string) {
  const r1 = sheet.addRow([company])
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: NAVY } }
  const r2 = sheet.addRow([title])
  r2.getCell(1).font = { italic: true, size: 11, color: { argb: MUTED } }
  const r3 = sheet.addRow([`Generated: ${fmtDate(new Date())}`])
  r3.getCell(1).font = { size: 9, color: { argb: MUTED } }
}

function addFiltersRow(sheet: ExcelJS.Worksheet, filters: ReportFilters) {
  const activeFilters = [
    `Period: ${fmtDate(filters.from)} to ${fmtDate(filters.to)}`,
    filters.customerId && `Customer: ${filters.customerId}`,
    filters.supplierId && `Supplier: ${filters.supplierId}`,
    filters.productId && `Product: ${filters.productId}`,
    filters.salesmanId && `Salesman: ${filters.salesmanId}`,
    filters.routeId && `Route: ${filters.routeId}`,
    filters.status && `Status: ${filters.status}`,
  ].filter(Boolean).join(" | ")
  const row = sheet.addRow([activeFilters])
  row.getCell(1).font = { size: 9, color: { argb: MUTED } }
  sheet.addRow([])
}

function addHeaders(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.addRow(headers)
  row.height = 20
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false }
    cell.border = { bottom: { style: "thin", color: { argb: MUTED } } }
  })
  return row.number
}

function styleRow(row: ExcelJS.Row, idx: number) {
  if (idx % 2 === 1) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } } })
  row.eachCell((cell) => { cell.alignment = { vertical: "middle" } })
}

function addTotalRow(sheet: ExcelJS.Worksheet, values: (string | number)[]) {
  const row = sheet.addRow(values)
  row.font = { bold: true, size: 10 }
  row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } } })
  return row
}

function setWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w })
}

function formatCurrencyColumns(sheet: ExcelJS.Worksheet, columns: number[]) {
  columns.forEach((col) => { sheet.getColumn(col).numFmt = '#,##0.00;[Red]-#,##0.00' })
}

function formatDateColumns(sheet: ExcelJS.Worksheet, columns: number[]) {
  columns.forEach((col) => { sheet.getColumn(col).numFmt = "yyyy-mm-dd" })
}

function freezePanes(sheet: ExcelJS.Worksheet, headerRow: number) {
  sheet.views = [{ state: "frozen", ySplit: headerRow, activeCell: `A${headerRow + 1}` }]
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: sheet.columnCount } }
}

async function toBuffer(wb: ExcelJS.Workbook) {
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

function baseSheet(input: WorkbookInput, name: string, title: string, headers: string[]) {
  const wb = createWorkbook()
  const sheet = wb.addWorksheet(name)
  addTitleRow(sheet, input.companyName, `${title} ${fmtDate(input.filters.from)} to ${fmtDate(input.filters.to)}`)
  addFiltersRow(sheet, input.filters)
  const headerRow = addHeaders(sheet, headers)
  freezePanes(sheet, headerRow)
  return { wb, sheet }
}

export async function generateSalesReport(input: WorkbookInput): Promise<Buffer> {
  const where: QueryWhere = { companyId: input.companyId, invoiceDate: { gte: input.filters.from, lte: input.filters.to } }
  if (input.filters.customerId) where.customerId = input.filters.customerId
  if (input.filters.salesmanId) where.userId = input.filters.salesmanId
  if (input.filters.productId) where.items = { some: { productId: input.filters.productId } }
  if (input.filters.routeId) where.customer = { routeId: input.filters.routeId }
  const invoices = await db.saleInvoice.findMany({ where, include: { customer: true, user: { select: { name: true } } }, orderBy: { invoiceDate: "asc" } })
  const { wb, sheet } = baseSheet(input, "Sales", "Sales Report", ["#", "Invoice No.", "Date", "Customer", "Route", "Prepared By", "Gross", "Discount", "Net Amount", "Paid", "Balance", "Status"])
  let netTotal = 0, paidTotal = 0, shown = 0
  invoices.forEach((inv) => {
    const net = toMoney(inv.netAmount), paid = toMoney(inv.paidAmount), status = statusFromAmounts(net, paid)
    if (!matchesStatus(input.filters.status, status)) return
    netTotal += net; paidTotal += paid
    const row = sheet.addRow([++shown, inv.invoiceNumber, inv.invoiceDate, inv.customer?.name ?? "Walk-in", inv.customer?.routeId ?? "—", inv.user.name, toMoney(inv.totalAmount), toMoney(inv.discountAmount), net, paid, net - paid, status])
    styleRow(row, shown)
    if (status === "PAID") row.getCell(12).font = { color: { argb: GREEN } }
    if (status === "UNPAID") row.getCell(12).font = { color: { argb: RED }, bold: true }
  })
  addTotalRow(sheet, ["", "", "", "", "", "TOTAL", "", "", netTotal, paidTotal, netTotal - paidTotal, ""])
  setWidths(sheet, [4, 15, 12, 24, 18, 20, 14, 12, 14, 14, 14, 10]); formatDateColumns(sheet, [3]); formatCurrencyColumns(sheet, [7,8,9,10,11])
  return toBuffer(wb)
}

export async function generatePurchaseReport(input: WorkbookInput): Promise<Buffer> {
  const where: QueryWhere = { companyId: input.companyId, orderDate: { gte: input.filters.from, lte: input.filters.to } }
  if (input.filters.supplierId) where.supplierId = input.filters.supplierId
  if (input.filters.salesmanId) where.userId = input.filters.salesmanId
  if (input.filters.productId) where.items = { some: { productId: input.filters.productId } }
  const purchases = await db.purchaseOrder.findMany({ where, include: { supplier: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { orderDate: "asc" } })
  const { wb, sheet } = baseSheet(input, "Purchases", "Purchase Report", ["#", "PO Number", "Date", "Supplier", "Prepared By", "Gross", "Discount", "Net Amount", "Paid", "Payable", "Status"])
  let netTotal = 0, paidTotal = 0, shown = 0
  purchases.forEach((po) => {
    const net = toMoney(po.netAmount), paid = toMoney(po.paidAmount), status = statusFromAmounts(net, paid)
    if (!matchesStatus(input.filters.status, status)) return
    netTotal += net; paidTotal += paid
    const row = sheet.addRow([++shown, po.poNumber, po.orderDate, po.supplier.name, po.user.name, toMoney(po.totalAmount), toMoney(po.discountAmount), net, paid, net - paid, status])
    styleRow(row, shown)
  })
  addTotalRow(sheet, ["", "", "", "", "TOTAL", "", "", netTotal, paidTotal, netTotal - paidTotal, ""])
  setWidths(sheet, [4, 15, 12, 24, 20, 14, 12, 14, 14, 14, 10]); formatDateColumns(sheet, [3]); formatCurrencyColumns(sheet, [6,7,8,9,10])
  return toBuffer(wb)
}

export async function generateStockReport(input: WorkbookInput): Promise<Buffer> {
  const where: QueryWhere = { companyId: input.companyId, isActive: true }
  if (input.filters.supplierId) where.supplierId = input.filters.supplierId
  if (input.filters.productId) where.id = input.filters.productId
  const products = await db.product.findMany({ where, include: { category: true, supplier: true, batches: { where: { companyId: input.companyId, quantity: { gt: 0 } } } }, orderBy: { name: "asc" } })
  const { wb, sheet } = baseSheet(input, "Stock", "Stock Report", ["#", "Product", "Category", "Supplier", "Total Stock", "Cost Value", "Sale Value", "Margin", "Expiring <30d", "Expiring <90d", "Alert"])
  const d30 = new Date(Date.now() + 30 * 86400_000), d90 = new Date(Date.now() + 90 * 86400_000)
  products.forEach((p, i) => {
    const qty = p.batches.reduce((s, b) => s + b.quantity, 0)
    const costVal = p.batches.reduce((s, b) => s + b.quantity * toMoney(b.purchasePrice), 0)
    const saleVal = qty * toMoney(p.salePrice)
    const exp30 = p.batches.filter((b) => b.expiryDate <= d30).reduce((s, b) => s + b.quantity, 0)
    const exp90 = p.batches.filter((b) => b.expiryDate > d30 && b.expiryDate <= d90).reduce((s, b) => s + b.quantity, 0)
    const alert = exp30 > 0 ? "CRITICAL" : exp90 > 0 ? "EXPIRING" : qty <= p.reorderLevel ? "LOW STOCK" : ""
    if (input.filters.status && input.filters.status.toUpperCase() !== alert.replace(" ", "_").toUpperCase()) return
    const row = sheet.addRow([i + 1, p.name, p.category?.name ?? "—", p.supplier?.name ?? "—", qty, costVal, saleVal, saleVal - costVal, exp30 || "", exp90 || "", alert])
    styleRow(row, i); if (alert) row.getCell(11).font = { bold: true, color: { argb: alert === "CRITICAL" ? RED : AMBER } }
  })
  setWidths(sheet, [4, 32, 18, 24, 12, 14, 14, 12, 13, 13, 12]); formatCurrencyColumns(sheet, [6,7,8])
  return toBuffer(wb)
}

export async function generateCustomerLedgerReport(input: WorkbookInput): Promise<Buffer> {
  const customerWhere: QueryWhere = { companyId: input.companyId }
  if (input.filters.customerId) customerWhere.id = input.filters.customerId
  if (input.filters.routeId) customerWhere.routeId = input.filters.routeId
  const customers = await db.customer.findMany({ where: customerWhere, include: { invoices: { where: { companyId: input.companyId, invoiceDate: { gte: input.filters.from, lte: input.filters.to } } }, payments: { where: { companyId: input.companyId, paymentDate: { gte: input.filters.from, lte: input.filters.to } } } }, orderBy: { name: "asc" } })
  const { wb, sheet } = baseSheet(input, "Customer Ledger", "Customer Ledger Report", ["#", "Customer", "Type", "Area", "Opening", "Invoiced", "Paid", "Outstanding", "Credit Limit", "Status"])
  let outstandingTotal = 0
  customers.forEach((c, i) => {
    const invoiced = c.invoices.reduce((s, inv) => s + toMoney(inv.netAmount), 0)
    const paid = c.invoices.reduce((s, inv) => s + toMoney(inv.paidAmount), 0) + c.payments.reduce((s, p) => s + toMoney(p.amount), 0)
    const outstanding = toMoney(c.openingBalance) + invoiced - paid
    const status = outstanding <= 0 ? "CLEAR" : outstanding > toMoney(c.creditLimit) ? "OVER_LIMIT" : "WITHIN_LIMIT"
    if (!matchesStatus(input.filters.status, status)) return
    outstandingTotal += outstanding
    const row = sheet.addRow([i + 1, c.name, c.type.replace("_", " "), c.area ?? "—", toMoney(c.openingBalance), invoiced, paid, outstanding, toMoney(c.creditLimit), status])
    styleRow(row, i)
  })
  addTotalRow(sheet, ["", "", "", "TOTAL", "", "", "", outstandingTotal, "", ""])
  setWidths(sheet, [4, 26, 14, 15, 14, 14, 14, 14, 14, 14]); formatCurrencyColumns(sheet, [5,6,7,8,9])
  return toBuffer(wb)
}

export async function generateRecoveryReport(input: WorkbookInput): Promise<Buffer> {
  const where: QueryWhere = { companyId: input.companyId, paymentDate: { gte: input.filters.from, lte: input.filters.to } }
  if (input.filters.customerId) where.customerId = input.filters.customerId
  if (input.filters.status) where.paymentMode = input.filters.status.toUpperCase()
  const payments = await db.customerPayment.findMany({ where, include: { customer: { select: { name: true, routeId: true } }, invoice: { select: { invoiceNumber: true } } }, orderBy: { paymentDate: "asc" } })
  const { wb, sheet } = baseSheet(input, "Recovery", "Recovery Report", ["#", "Date", "Customer", "Route", "Invoice", "Mode", "Reference", "Amount", "Notes"])
  let total = 0, shown = 0
  payments.filter((p) => !input.filters.routeId || p.customer.routeId === input.filters.routeId).forEach((p) => { total += toMoney(p.amount); const row = sheet.addRow([++shown, p.paymentDate, p.customer.name, p.customer.routeId ?? "—", p.invoice?.invoiceNumber ?? "—", p.paymentMode, p.reference ?? "—", toMoney(p.amount), p.notes ?? ""]); styleRow(row, shown) })
  addTotalRow(sheet, ["", "", "", "", "", "", "TOTAL", total, ""])
  setWidths(sheet, [4, 12, 26, 18, 16, 12, 18, 14, 30]); formatDateColumns(sheet, [2]); formatCurrencyColumns(sheet, [8])
  return toBuffer(wb)
}

export async function generateTrialBalanceReport(input: WorkbookInput): Promise<Buffer> {
  const accounts = await db.account.findMany({ where: { companyId: input.companyId }, include: { debitLines: { where: { journalEntry: { companyId: input.companyId, entryDate: { gte: input.filters.from, lte: input.filters.to } } } }, creditLines: { where: { journalEntry: { companyId: input.companyId, entryDate: { gte: input.filters.from, lte: input.filters.to } } } } }, orderBy: [{ type: "asc" }, { code: "asc" }] })
  const { wb, sheet } = baseSheet(input, "Trial Balance", "Trial Balance Report", ["Code", "Account", "Type", "Debit", "Credit", "Balance"])
  let debitTotal = 0, creditTotal = 0
  accounts.forEach((a, i) => { const debit = a.debitLines.reduce((s, l) => s + toMoney(l.amount), 0); const credit = a.creditLines.reduce((s, l) => s + toMoney(l.amount), 0); debitTotal += debit; creditTotal += credit; const row = sheet.addRow([a.code, a.name, a.type, debit, credit, debit - credit]); styleRow(row, i) })
  addTotalRow(sheet, ["", "TOTAL", "", debitTotal, creditTotal, debitTotal - creditTotal])
  setWidths(sheet, [12, 30, 14, 14, 14, 14]); formatCurrencyColumns(sheet, [4,5,6])
  return toBuffer(wb)
}

export async function generatePLReport(input: WorkbookInput): Promise<Buffer> {
  const [sales, purchases, expenses] = await Promise.all([
    db.saleInvoice.findMany({ where: { companyId: input.companyId, invoiceDate: { gte: input.filters.from, lte: input.filters.to } } }),
    db.purchaseOrder.findMany({ where: { companyId: input.companyId, orderDate: { gte: input.filters.from, lte: input.filters.to } } }),
    db.expense.findMany({ where: { companyId: input.companyId, expenseDate: { gte: input.filters.from, lte: input.filters.to } } }),
  ])
  const revenue = sales.reduce((s, inv) => s + toMoney(inv.netAmount), 0), cogs = purchases.reduce((s, po) => s + toMoney(po.netAmount), 0), expense = expenses.reduce((s, e) => s + toMoney(e.amount), 0)
  const { wb, sheet } = baseSheet(input, "P&L", "Profit & Loss Report", ["Section", "Amount"])
  ;[["Revenue", revenue], ["Cost of Goods/Purchases", -cogs], ["Gross Profit", revenue - cogs], ["Operating Expenses", -expense], ["Net Profit/Loss", revenue - cogs - expense]].forEach((v, i) => { const row = sheet.addRow(v); styleRow(row, i); if (i === 2 || i === 4) row.font = { bold: true } })
  setWidths(sheet, [32, 16]); formatCurrencyColumns(sheet, [2])
  return toBuffer(wb)
}

export async function generateBalanceSheetReport(input: WorkbookInput): Promise<Buffer> {
  const accounts = await db.account.findMany({ where: { companyId: input.companyId, type: { in: ["ASSET", "LIABILITY", "EQUITY"] } }, include: { debitLines: { where: { journalEntry: { companyId: input.companyId, entryDate: { lte: input.filters.to } } } }, creditLines: { where: { journalEntry: { companyId: input.companyId, entryDate: { lte: input.filters.to } } } } }, orderBy: [{ type: "asc" }, { code: "asc" }] })
  const { wb, sheet } = baseSheet(input, "Balance Sheet", "Balance Sheet Report", ["Code", "Account", "Type", "Amount"])
  let assets = 0, liabilities = 0, equity = 0
  accounts.forEach((a, i) => { const debit = a.debitLines.reduce((s, l) => s + toMoney(l.amount), 0); const credit = a.creditLines.reduce((s, l) => s + toMoney(l.amount), 0); const amount = a.type === "ASSET" ? debit - credit : credit - debit; if (a.type === "ASSET") assets += amount; else if (a.type === "LIABILITY") liabilities += amount; else equity += amount; const row = sheet.addRow([a.code, a.name, a.type, amount]); styleRow(row, i) })
  addTotalRow(sheet, ["", "Total Assets", "ASSET", assets]); addTotalRow(sheet, ["", "Total Liabilities", "LIABILITY", liabilities]); addTotalRow(sheet, ["", "Total Equity", "EQUITY", equity]); addTotalRow(sheet, ["", "Balance Check", "", assets - liabilities - equity])
  setWidths(sheet, [12, 30, 14, 16]); formatCurrencyColumns(sheet, [4])
  return toBuffer(wb)
}

export async function generateReport(companyId: string, companyName: string, from: Date, to: Date): Promise<Buffer> {
  return generateSalesReport({ companyId, companyName, filters: { from, to } })
}

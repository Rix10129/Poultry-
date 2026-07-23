/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"

export type ReportSlug =
  | "sales"
  | "collection"
  | "salesman"
  | "area"
  | "recovery"
  | "purchases"
  | "stock"
  | "aging"
  | "pl"
  | "trial-balance"
  | "balance-sheet"
  | "fbr-tax"
  | "targets"
  | "audit"

const MANAGER_ROLES = new Set(["OWNER", "ADMIN"])
const STAFF_REPORTS = new Set<ReportSlug>(["sales", "collection"])

export function canExportReport(role: string | undefined, report: string): report is ReportSlug {
  if (!role || !isReportSlug(report)) return false
  if (MANAGER_ROLES.has(role)) return true
  return (role === "CASHIER" || role === "SALESMAN") && STAFF_REPORTS.has(report)
}

export function isReportSlug(report: string): report is ReportSlug {
  return [
    "sales", "collection", "salesman", "area", "recovery", "purchases", "stock", "aging",
    "pl", "trial-balance", "balance-sheet", "fbr-tax", "targets", "audit",
  ].includes(report)
}

function num(v: unknown) {
  return parseFloat(String(v ?? 0)) || 0
}

function dateRange(params: URLSearchParams, fieldStart = "from", fieldEnd = "to") {
  const from = params.get(fieldStart)
  const to = params.get(fieldEnd)
  return {
    fromDate: from ? new Date(`${from}T00:00:00`) : undefined,
    toDate: to ? new Date(`${to}T23:59:59`) : undefined,
  }
}

function csvEscape(value: unknown) {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")
}

export async function generateOperationalReportCsv(companyId: string, report: ReportSlug, params: URLSearchParams) {
  switch (report) {
    case "sales": {
      const { fromDate, toDate } = dateRange(params)
      const type = params.get("type")
      const rows = await db.saleInvoice.findMany({
        where: {
          companyId,
          ...(fromDate || toDate ? { invoiceDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
          ...(type === "WALK_IN" ? { customerId: null } : type ? { customer: { type: type as any } } : {}),
        },
        include: { customer: { select: { name: true, type: true } }, user: { select: { name: true } } },
        orderBy: { invoiceDate: "desc" },
      })
      return toCsv(["Invoice", "Date", "Customer", "Customer Type", "Prepared By", "Net", "Paid", "Balance"], rows.map((r: any) => [r.invoiceNumber, r.invoiceDate, r.customer?.name ?? "Walk-in", r.customer?.type ?? "WALK_IN", r.user.name, r.netAmount, r.paidAmount, num(r.netAmount) - num(r.paidAmount)]))
    }
    case "collection": {
      const { fromDate, toDate } = dateRange(params)
      const rows = await db.customerPayment.findMany({
        where: { companyId, ...(fromDate || toDate ? { paymentDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}) },
        include: { customer: { select: { name: true, area: true } }, invoice: { select: { invoiceNumber: true, user: { select: { name: true } } } } },
        orderBy: { paymentDate: "asc" },
      })
      return toCsv(["Date", "Customer", "Area", "Invoice", "Salesman", "Mode", "Amount", "Notes"], rows.map((r: any) => [r.paymentDate, r.customer.name, r.customer.area, r.invoice?.invoiceNumber ?? "Direct", r.invoice?.user?.name ?? "Direct / Walk-in", r.mode, r.amount, r.notes]))
    }
    case "purchases": {
      const { fromDate, toDate } = dateRange(params)
      const supplierId = params.get("supplierId")
      const rows = await db.purchaseOrder.findMany({ where: { companyId, ...(supplierId ? { supplierId } : {}), ...(fromDate || toDate ? { orderDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}) }, include: { supplier: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { orderDate: "desc" } })
      return toCsv(["PO", "Date", "Supplier", "Prepared By", "Net", "Paid", "Payable"], rows.map((r: any) => [r.poNumber, r.orderDate, r.supplier.name, r.user.name, r.netAmount, r.paidAmount, num(r.netAmount) - num(r.paidAmount)]))
    }
    case "stock": {
      const rows = await db.product.findMany({ where: { companyId }, include: { category: { select: { name: true } }, batches: { select: { quantity: true, purchasePrice: true, expiryDate: true } } }, orderBy: { name: "asc" } })
      return toCsv(["Product", "Category", "Stock", "Cost Value", "Sale Price", "Reorder Level"], rows.map((p: any) => { const stock = p.batches.reduce((s: number,b: any)=>s+b.quantity,0); return [p.name, p.category?.name ?? "", stock, p.batches.reduce((s: number,b: any)=>s+b.quantity*num(b.purchasePrice),0), p.salePrice, p.reorderLevel] }))
    }
    default:
      return toCsv(["Report", "Message"], [[report, "CSV export endpoint is available to managers. Detailed row export for this report will be expanded as report fields evolve."]])
  }
}

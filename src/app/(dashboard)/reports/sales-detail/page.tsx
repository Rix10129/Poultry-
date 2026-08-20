import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ListTree, Printer } from "lucide-react"
import { ExportButtons } from "@/components/reports/export-buttons"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Sales Report — Detail" }

interface Props {
  searchParams: Promise<{ from?: string; to?: string; customerId?: string; productId?: string }>
}

export default async function SalesDetailReportPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { from, to, customerId, productId } = await searchParams

  const fromDate = from ? new Date(`${from}T00:00:00`) : undefined
  const toDate = to ? new Date(`${to}T23:59:59`) : undefined

  const [items, customers, products] = await Promise.all([
    db.saleInvoiceItem.findMany({
      where: {
        invoice: {
          companyId,
          status: "POSTED",
          ...(fromDate || toDate ? { invoiceDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
          ...(customerId ? { customerId } : {}),
        },
        ...(productId ? { productId } : {}),
      },
      include: {
        invoice: { select: { invoiceNumber: true, invoiceDate: true, customer: { select: { name: true } }, walkInCustomerName: true } },
        product: { select: { name: true, unit: true } },
        batch: { select: { batchNumber: true } },
      },
      orderBy: [{ invoice: { invoiceDate: "desc" } }, { invoice: { invoiceNumber: "desc" } }],
    }),
    db.customer.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.product.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  const rows = items.map((item) => ({
    id: item.id,
    invoiceId: item.invoiceId,
    date: item.invoice.invoiceDate,
    invoiceNumber: item.invoice.invoiceNumber,
    customer: item.invoice.customer?.name ?? item.invoice.walkInCustomerName ?? "Walk-in",
    product: item.product.name,
    unit: item.product.unit,
    batch: item.batch.batchNumber,
    isBonus: item.isBonus,
    qty: item.quantity, unitPrice: Number(item.salePrice), amount: Number(item.totalAmount),
  }))

  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-6 max-w-7xl print-wide-report">
      {/* This report has enough columns to want the extra width — print it
          landscape so the whole register fits one page width instead of
          tiling across pages. */}
      <style>{"@media print { @page { size: A4 landscape; margin: 8mm; } }"}</style>
      <div className="flex items-start justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/reports/sales" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sales Report — Detail</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {rows.length} line item{rows.length !== 1 ? "s" : ""}
              {from || to ? ` · ${from ?? "start"} → ${to ?? "today"}` : " · all time"} · posted invoices only
            </p>
          </div>
        </div>
        <a
          href={`/api/reports/sales-detail/export?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(customerId ? { customerId } : {}), ...(productId ? { productId } : {}), format: "pdf" }).toString()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-700"
        >
          <Printer className="h-4 w-4" />
          Print
        </a>
      </div>

      {/* Printed heading — the on-screen header above is hidden for print
          since it carries the back-arrow/page chrome, not report content. */}
      <div className="hidden print:block">
        <h1 className="text-lg font-bold text-slate-900">Sales Report — Detail</h1>
        <p className="text-xs text-slate-600">
          {from || to ? `${from ?? "start"} → ${to ?? "today"}` : "All time"} · posted invoices only · {rows.length} line item{rows.length !== 1 ? "s" : ""}
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input name="from" type="date" defaultValue={from} className="h-9 block rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input name="to" type="date" defaultValue={to} className="h-9 block rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Customer</label>
          <select name="customerId" defaultValue={customerId ?? ""} className="h-9 block rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[16rem]">
            <option value="">All customers</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Product</label>
          <select name="productId" defaultValue={productId ?? ""} className="h-9 block rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[16rem]">
            <option value="">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        <ExportButtons endpoint="/api/reports/sales-detail/export" params={{ from, to, customerId, productId }} />
        {(from || to || customerId || productId) && (
          <Link href="/reports/sales-detail">
            <Button variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      <div className="grid grid-cols-2 gap-4 max-w-xl">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Units Sold</p>
          <p className="text-2xl font-bold text-slate-900">{totalQty.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Net Sales</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalAmount)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Line-Item Detail</h2>
        </div>
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <ListTree className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No sale line items found for the selected filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 whitespace-nowrap">Invoice #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Customer</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Product</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Batch</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">Unit Price</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/sales/${r.invoiceId}`} className="font-mono font-semibold text-blue-600 hover:text-blue-700 text-xs">
                        {r.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{r.customer}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium">
                      {r.product}
                      {r.isBonus && <span className="ml-1.5 text-[10px] font-semibold text-amber-600 border border-amber-200 bg-amber-50 rounded px-1">BONUS</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{r.batch}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{r.qty} <span className="text-slate-400 text-xs">{r.unit}</span></td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600">{formatCurrency(r.unitPrice)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={5} className="px-4 py-2.5 text-sm font-semibold text-right text-slate-700">Totals</td>
                  <td className="px-4 py-2.5 text-right font-bold font-mono text-slate-900">{totalQty}</td>
                  <td />
                  <td className="px-4 py-2.5 text-right font-bold font-mono text-slate-900">{formatCurrency(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

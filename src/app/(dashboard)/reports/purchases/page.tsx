import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate } from "@/lib/utils"

import { ReportExportControls } from "@/components/reports/export-button"
export const dynamic = "force-dynamic"
export const metadata = { title: "Purchase Report" }

export default async function PurchaseReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; supplierId?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { from, to, supplierId } = await searchParams

  const fromDate = from ? new Date(from) : undefined
  const toDate = to ? new Date(to + "T23:59:59") : undefined

  const [orders, suppliers] = await Promise.all([
    db.purchaseOrder.findMany({
      where: {
        companyId,
        ...(fromDate || toDate ? {
          orderDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        } : {}),
        ...(supplierId ? { supplierId } : {}),
      },
      orderBy: { orderDate: "desc" },
      include: {
        supplier: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
    db.supplier.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const totalNet = orders.reduce((s, o) => s + parseFloat(o.netAmount.toString()), 0)
  const totalPaid = orders.reduce((s, o) => s + parseFloat(o.paidAmount.toString()), 0)
  const totalOutstanding = totalNet - totalPaid

  // Group by supplier
  const bySupplier: Record<string, { name: string; count: number; net: number; paid: number }> = {}
  for (const order of orders) {
    const sid = order.supplierId
    if (!bySupplier[sid]) bySupplier[sid] = { name: order.supplier.name, count: 0, net: 0, paid: 0 }
    bySupplier[sid].count++
    bySupplier[sid].net += parseFloat(order.netAmount.toString())
    bySupplier[sid].paid += parseFloat(order.paidAmount.toString())
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Report</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {orders.length} order{orders.length !== 1 ? "s" : ""}
            {from || to ? ` · ${from ?? "start"} → ${to ?? "today"}` : " · all time"}
          </p>
        </div>
        <ReportExportControls report="purchases" />
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="from"
          type="date"
          defaultValue={from}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          name="to"
          type="date"
          defaultValue={to}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="supplierId"
          defaultValue={supplierId ?? ""}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        {(from || to || supplierId) && (
          <Link href="/reports/purchases">
            <Button variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Purchased</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalNet)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{orders.length} orders</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Paid</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {totalNet > 0 ? Math.round((totalPaid / totalNet) * 100) : 0}% of total
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Payable</p>
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalOutstanding)}</p>
          <p className="text-xs text-slate-400 mt-0.5">outstanding to suppliers</p>
        </div>
      </div>

      {/* Supplier breakdown */}
      {Object.keys(bySupplier).length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Supplier Breakdown</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Supplier</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Orders</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Net Amount</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Paid</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Object.entries(bySupplier)
                .sort(([, a], [, b]) => b.net - a.net)
                .map(([sid, row]) => (
                  <tr key={sid} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium text-slate-700">{row.name}</td>
                    <td className="px-5 py-2.5 text-right text-slate-600">{row.count}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-slate-900">{formatCurrency(row.net)}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-green-700">{formatCurrency(row.paid)}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-orange-600">
                      {formatCurrency(row.net - row.paid)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Orders list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Order Detail</h2>
        </div>
        {orders.length === 0 ? (
          <div className="py-16 text-center">
            <ShoppingCart className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No purchase orders found for the selected filters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">PO #</th>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Date</th>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Supplier</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Net</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Paid</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {orders.map((order) => {
                const net = parseFloat(order.netAmount.toString())
                const paid = parseFloat(order.paidAmount.toString())
                return (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/purchases/${order.id}`}
                        className="font-mono font-semibold text-blue-600 hover:text-blue-700 text-xs"
                      >
                        {order.poNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(order.orderDate)}</td>
                    <td className="px-5 py-2.5 text-slate-700">{order.supplier.name}</td>
                    <td className="px-5 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(net)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-green-700">{formatCurrency(paid)}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-orange-600">
                      {formatCurrency(net - paid)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={3} className="px-5 py-2.5 text-sm font-semibold text-right text-slate-700">Totals</td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-slate-900">
                  {formatCurrency(totalNet)}
                </td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-green-700">
                  {formatCurrency(totalPaid)}
                </td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-orange-600">
                  {formatCurrency(totalOutstanding)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

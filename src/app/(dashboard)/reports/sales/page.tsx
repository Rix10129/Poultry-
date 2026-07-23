import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"

import { ReportExportControls } from "@/components/reports/export-button"
export const dynamic = "force-dynamic"
export const metadata = { title: "Sales Report" }

const TYPE_LABELS: Record<string, string> = {
  FARM: "Farm",
  VET_SHOP: "Vet Shop",
  SUB_DEALER: "Sub-Dealer",
  RETAIL: "Retail",
  WALK_IN: "Walk-in",
}

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { from, to, type } = await searchParams

  const fromDate = from ? new Date(from) : undefined
  const toDate = to ? new Date(to + "T23:59:59") : undefined

  const invoices = await db.saleInvoice.findMany({
    where: {
      companyId,
      ...(fromDate || toDate ? {
        invoiceDate: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        },
      } : {}),
      ...(type === "WALK_IN"
        ? { customerId: null }
        : type
        ? { customer: { type: type as any } }
        : {}),
    },
    orderBy: { invoiceDate: "desc" },
    include: {
      customer: { select: { name: true, type: true } },
      user: { select: { name: true } },
    },
  })

  const totalNet = invoices.reduce((s, i) => s + parseFloat(i.netAmount.toString()), 0)
  const totalPaid = invoices.reduce((s, i) => s + parseFloat(i.paidAmount.toString()), 0)
  const totalOutstanding = totalNet - totalPaid

  // group by customer type
  const byType: Record<string, { count: number; net: number; paid: number }> = {}
  for (const inv of invoices) {
    const key = inv.customerId ? (inv.customer?.type ?? "RETAIL") : "WALK_IN"
    if (!byType[key]) byType[key] = { count: 0, net: 0, paid: 0 }
    byType[key].count++
    byType[key].net += parseFloat(inv.netAmount.toString())
    byType[key].paid += parseFloat(inv.paidAmount.toString())
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sales Report</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
              {from || to ? ` · ${from ?? "start"} → ${to ?? "today"}` : " · all time"}
            </p>
          </div>
        </div>
        <ReportExportControls report="sales" />
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
          name="type"
          defaultValue={type ?? ""}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All customer types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        {(from || to || type) && (
          <Link href="/reports/sales">
            <Button variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Sales</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalNet)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{invoices.length} invoices</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Collected</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {totalNet > 0 ? Math.round((totalPaid / totalNet) * 100) : 0}% recovery
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalOutstanding)}</p>
          <p className="text-xs text-slate-400 mt-0.5">unpaid balance</p>
        </div>
      </div>

      {/* Customer type breakdown */}
      {Object.keys(byType).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Breakdown by Customer Type</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Type</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Invoices</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Net Sales</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Collected</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Object.entries(byType)
                .sort(([, a], [, b]) => b.net - a.net)
                .map(([key, row]) => (
                  <tr key={key} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-medium text-slate-700">{TYPE_LABELS[key] ?? key}</td>
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

      {/* Invoice list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Invoice Detail</h2>
        </div>
        {invoices.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No invoices found for the selected filters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Invoice #</th>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Date</th>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Customer</th>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Type</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Net</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Paid</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoices.map((inv) => {
                const net = parseFloat(inv.netAmount.toString())
                const paid = parseFloat(inv.paidAmount.toString())
                const bal = net - paid
                const isPaid = bal <= 0.001
                const isPartial = !isPaid && paid > 0.001
                return (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/sales/${inv.id}`}
                        className="font-mono font-semibold text-blue-600 hover:text-blue-700 text-xs"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-5 py-2.5 text-slate-700">
                      {inv.customer?.name ?? <span className="italic text-slate-400">Walk-in</span>}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs">
                      {inv.customer ? (TYPE_LABELS[inv.customer.type] ?? inv.customer.type) : "Walk-in"}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(net)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-green-700">{formatCurrency(paid)}</td>
                    <td className="px-5 py-2.5 text-right">
                      {isPaid ? (
                        <Badge variant="success">Paid</Badge>
                      ) : isPartial ? (
                        <Badge variant="warning">Partial</Badge>
                      ) : (
                        <Badge variant="danger">Unpaid</Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={4} className="px-5 py-2.5 text-sm font-semibold text-right text-slate-700">
                  Totals
                </td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-slate-900">
                  {formatCurrency(totalNet)}
                </td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-green-700">
                  {formatCurrency(totalPaid)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

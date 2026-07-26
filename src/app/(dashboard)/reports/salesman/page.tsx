import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ReportExportButton } from "@/components/reports/report-export-button"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Salesman Performance" }

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })
}

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function SalesmanReportPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { from, to } = await searchParams

  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const fromDate = from ? new Date(from + "T00:00:00") : defaultFrom
  const toDate = to ? new Date(to + "T23:59:59") : new Date(isoDate(defaultTo) + "T23:59:59")

  // Fetch all invoices in range with user info
  const invoices = await db.saleInvoice.findMany({
    where: {
      companyId,
      invoiceDate: { gte: fromDate, lte: toDate },
    },
    select: {
      id: true,
      userId: true,
      netAmount: true,
      paidAmount: true,
      user: { select: { id: true, name: true, role: true } },
    },
  })

  // Group by salesman
  type SalesmanRow = {
    id: string
    name: string
    role: string
    invoiceCount: number
    totalSales: number
    totalCollected: number
    outstanding: number
  }

  const map = new Map<string, SalesmanRow>()
  for (const inv of invoices) {
    const net = parseFloat(inv.netAmount.toString())
    const paid = parseFloat(inv.paidAmount.toString())
    const balance = Math.max(0, net - paid)

    const existing = map.get(inv.userId)
    if (existing) {
      existing.invoiceCount++
      existing.totalSales += net
      existing.totalCollected += paid
      existing.outstanding += balance
    } else {
      map.set(inv.userId, {
        id: inv.userId,
        name: inv.user.name,
        role: inv.user.role,
        invoiceCount: 1,
        totalSales: net,
        totalCollected: paid,
        outstanding: balance,
      })
    }
  }

  const rows = Array.from(map.values()).sort((a, b) => b.totalSales - a.totalSales)

  const totals = {
    invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
    totalSales: rows.reduce((s, r) => s + r.totalSales, 0),
    totalCollected: rows.reduce((s, r) => s + r.totalCollected, 0),
    outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
  }

  const ROLE_LABELS: Record<string, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    CASHIER: "Cashier",
    SALESMAN: "Salesman",
  }

  return (
    <div className="space-y-6">

      <div className="flex justify-end">
        <ReportExportButton report="salesman" />
      </div>

      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salesman Performance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sales and collection per salesman</p>
        </div>
      </div>

      {/* Date filter */}
      <form method="get" className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input type="date" name="from" defaultValue={isoDate(fromDate)}
            className="block border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input type="date" name="to" defaultValue={isoDate(toDate)}
            className="block border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          Apply
        </button>
      </form>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Sales",     value: formatCurrency(totals.totalSales),     color: "border-blue-200 bg-blue-50 text-blue-700" },
          { label: "Collected",       value: formatCurrency(totals.totalCollected), color: "border-green-200 bg-green-50 text-green-700" },
          { label: "Outstanding",     value: formatCurrency(totals.outstanding),    color: "border-red-200 bg-red-50 text-red-700" },
          { label: "Invoices Issued", value: totals.invoiceCount.toString(),        color: "border-slate-200 bg-slate-50 text-slate-700" },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.color}`}>
            <p className="text-xs font-medium opacity-70">{c.label}</p>
            <p className="text-xl font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="font-medium text-slate-600">No sales in this period</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Salesman</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Invoices</th>
                <th className="text-right px-4 py-3 font-medium text-blue-700 bg-blue-50">Total Sales</th>
                <th className="text-right px-4 py-3 font-medium text-green-700 bg-green-50">Collected</th>
                <th className="text-right px-4 py-3 font-medium text-red-700 bg-red-50">Outstanding</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Recovery %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const recoveryPct = row.totalSales > 0
                  ? Math.round((row.totalCollected / row.totalSales) * 100)
                  : 100
                return (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {ROLE_LABELS[row.role] ?? row.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{row.invoiceCount}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-700 bg-blue-50/50">
                      {formatCurrency(row.totalSales)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-700 bg-green-50/50">
                      {formatCurrency(row.totalCollected)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-red-700 bg-red-50/50">
                      {row.outstanding > 0.01 ? formatCurrency(row.outstanding) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${
                        recoveryPct >= 90 ? "text-green-600" :
                        recoveryPct >= 70 ? "text-yellow-600" :
                        "text-red-600"
                      }`}>
                        {recoveryPct}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 font-bold text-slate-900">Grand Total</td>
                <td className="px-4 py-3 text-right font-bold text-blue-700 bg-blue-50">
                  {formatCurrency(totals.totalSales)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-green-700 bg-green-50">
                  {formatCurrency(totals.totalCollected)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-red-700 bg-red-50">
                  {formatCurrency(totals.outstanding)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-700">
                  {totals.totalSales > 0 ? Math.round((totals.totalCollected / totals.totalSales) * 100) : 100}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

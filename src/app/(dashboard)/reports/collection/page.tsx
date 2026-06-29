import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Collection Report" }

function formatDate(d: Date) {
  return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function CollectionReportPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { from, to } = await searchParams

  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const fromDate = from ? new Date(from + "T00:00:00") : defaultFrom
  const toDate = to ? new Date(to + "T23:59:59") : new Date(defaultTo.toDateString() + " 23:59:59")

  // Fetch payments in date range with invoice user (salesman) info
  const payments = await db.customerPayment.findMany({
    where: {
      companyId,
      paymentDate: { gte: fromDate, lte: toDate },
    },
    include: {
      customer: { select: { id: true, name: true, area: true } },
      invoice: {
        select: {
          invoiceNumber: true,
          userId: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { paymentDate: "asc" },
  })

  // Group by salesman (from invoice.user), then by date
  type DayEntry = { date: string; amount: number; paymentCount: number }
  type SalesmanRow = {
    userId: string
    userName: string
    days: Map<string, DayEntry>
    total: number
    paymentCount: number
  }

  const salesmanMap = new Map<string, SalesmanRow>()

  for (const pmt of payments) {
    // Salesman is whoever created the linked invoice; if no invoice, treat as direct/unknown
    const userId = pmt.invoice?.userId ?? "direct"
    const userName = pmt.invoice?.user?.name ?? "Direct / Walk-in"

    const dateKey = isoDate(new Date(pmt.paymentDate))
    const amount = parseFloat(pmt.amount.toString())

    if (!salesmanMap.has(userId)) {
      salesmanMap.set(userId, {
        userId,
        userName,
        days: new Map(),
        total: 0,
        paymentCount: 0,
      })
    }

    const row = salesmanMap.get(userId)!
    row.total += amount
    row.paymentCount++

    if (!row.days.has(dateKey)) {
      row.days.set(dateKey, { date: dateKey, amount: 0, paymentCount: 0 })
    }
    const day = row.days.get(dateKey)!
    day.amount += amount
    day.paymentCount++
  }

  const salesmenRows = Array.from(salesmanMap.values()).sort((a, b) => b.total - a.total)
  const grandTotal = salesmenRows.reduce((s, r) => s + r.total, 0)
  const grandCount = salesmenRows.reduce((s, r) => s + r.paymentCount, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Collection Report</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Payments collected, grouped by salesman
          </p>
        </div>
      </div>

      {/* Date filter */}
      <form method="get" className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input
            type="date"
            name="from"
            defaultValue={isoDate(fromDate)}
            className="block border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input
            type="date"
            name="to"
            defaultValue={isoDate(toDate)}
            className="block border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Apply
        </button>
      </form>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium text-blue-600 opacity-80">Total Collected</p>
          <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(grandTotal)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-600 opacity-80">Transactions</p>
          <p className="text-xl font-bold text-slate-700 mt-1">{grandCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-600 opacity-80">Salesmen Active</p>
          <p className="text-xl font-bold text-slate-700 mt-1">{salesmenRows.length}</p>
        </div>
      </div>

      {salesmenRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="font-medium text-slate-600">No payments in this period</p>
          <p className="text-sm text-slate-400 mt-1">Try adjusting the date range</p>
        </div>
      ) : (
        <div className="space-y-6">
          {salesmenRows.map((salesman) => {
            const dayRows = Array.from(salesman.days.values()).sort((a, b) =>
              a.date.localeCompare(b.date)
            )

            return (
              <div key={salesman.userId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {/* Salesman header */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <div>
                    <p className="font-semibold text-slate-900">{salesman.userName}</p>
                    <p className="text-xs text-slate-500">{salesman.paymentCount} transactions</p>
                  </div>
                  <p className="text-lg font-bold text-slate-900">{formatCurrency(salesman.total)}</p>
                </div>

                {/* Daily breakdown */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-2 font-medium text-slate-500 text-xs">Date</th>
                      <th className="text-right px-5 py-2 font-medium text-slate-500 text-xs">Payments</th>
                      <th className="text-right px-5 py-2 font-medium text-slate-500 text-xs">Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dayRows.map((day) => (
                      <tr key={day.date} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-2.5 text-slate-700">
                          {formatDate(new Date(day.date + "T12:00:00"))}
                        </td>
                        <td className="px-5 py-2.5 text-right text-slate-500">{day.paymentCount}</td>
                        <td className="px-5 py-2.5 text-right font-medium text-slate-900">
                          {formatCurrency(day.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={2} className="px-5 py-2.5 text-xs font-bold text-slate-700">Subtotal</td>
                      <td className="px-5 py-2.5 text-right font-bold text-slate-900">
                        {formatCurrency(salesman.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })}

          {/* Grand total */}
          <div className="rounded-xl border-2 border-slate-900 bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
            <div>
              <p className="font-bold text-base">Grand Total</p>
              <p className="text-xs text-slate-400">{grandCount} transactions · {formatDate(fromDate)} – {formatDate(toDate)}</p>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(grandTotal)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

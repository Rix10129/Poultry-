import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Expenses" }

const CATEGORY_LABELS: Record<string, string> = {
  FUEL:         "Fuel / Petrol",
  VEHICLE:      "Vehicle Maintenance",
  SALARY:       "Salary & Wages",
  RENT:         "Rent",
  UTILITIES:    "Utilities",
  OFFICE:       "Office Supplies",
  MARKETING:    "Marketing & Samples",
  BANK_CHARGES: "Bank Charges",
  OTHER:        "Other",
}

const CATEGORY_COLORS: Record<string, string> = {
  FUEL:         "bg-orange-100 text-orange-700",
  VEHICLE:      "bg-blue-100 text-blue-700",
  SALARY:       "bg-purple-100 text-purple-700",
  RENT:         "bg-slate-100 text-slate-700",
  UTILITIES:    "bg-yellow-100 text-yellow-700",
  OFFICE:       "bg-green-100 text-green-700",
  MARKETING:    "bg-pink-100 text-pink-700",
  BANK_CHARGES: "bg-red-100 text-red-700",
  OTHER:        "bg-slate-100 text-slate-600",
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

interface Props {
  searchParams: Promise<{ from?: string; to?: string; category?: string }>
}

export default async function ExpensesPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { from, to, category } = await searchParams

  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const fromDate = from ? new Date(from + "T00:00:00") : defaultFrom
  const toDate = to ? new Date(to + "T23:59:59") : new Date(isoDate(defaultTo) + "T23:59:59")

  const expenses = await db.expense.findMany({
    where: {
      companyId,
      expenseDate: { gte: fromDate, lte: toDate },
      ...(category ? { category: category as any } : {}),
    },
    include: {
      user: { select: { name: true } },
    },
    orderBy: { expenseDate: "desc" },
  })

  const totalAmount = expenses.reduce((s, e) => s + parseFloat(e.amount.toString()), 0)

  // Category breakdown
  const byCategory: Record<string, number> = {}
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + parseFloat(e.amount.toString())
  }
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track daily business expenses</p>
        </div>
        <Link href="/expenses/new">
          <Button>
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>
        </Link>
      </div>

      {/* Filter bar */}
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
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Category</label>
          <select
            name="category"
            defaultValue={category ?? ""}
            className="block border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Apply
        </button>
      </form>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 md:col-span-1 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-600 opacity-80">Total Expenses</p>
          <p className="text-xl font-bold text-red-700 mt-1">{formatCurrency(totalAmount)}</p>
          <p className="text-xs text-red-500 mt-0.5">{expenses.length} entries</p>
        </div>
        {topCategories.slice(0, 3).map(([cat, amt]) => (
          <div key={cat} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500 truncate">{CATEGORY_LABELS[cat] ?? cat}</p>
            <p className="text-lg font-bold text-slate-800 mt-1">{formatCurrency(amt)}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {totalAmount > 0 ? Math.round((amt / totalAmount) * 100) : 0}% of total
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      {expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="font-medium text-slate-600">No expenses in this period</p>
          <p className="text-sm text-slate-400 mt-1">Add your first expense to get started</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">By</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-600">
                    <Link href={`/expenses/${e.id}`} className="hover:underline">
                      {e.expenseDate.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[e.category] ?? "bg-slate-100 text-slate-600"}`}>
                      {CATEGORY_LABELS[e.category] ?? e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <Link href={`/expenses/${e.id}`} className="hover:text-blue-600 hover:underline">
                      {e.description}
                    </Link>
                    <Link href={`/expenses/${e.id}/edit`} className="ml-2 text-xs text-slate-500 hover:text-blue-600">Edit</Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{e.user.name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(parseFloat(e.amount.toString()))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50">
              <tr>
                <td colSpan={4} className="px-4 py-3 font-bold text-slate-900">Total</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900 text-base">
                  {formatCurrency(totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

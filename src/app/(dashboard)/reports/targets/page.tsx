import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ReportExportButton } from "@/components/reports/report-export-button"
import { formatCurrency } from "@/lib/utils"
import { revalidatePath } from "next/cache"

export const dynamic = "force-dynamic"
export const metadata = { title: "Sales Targets" }

async function saveTarget(formData: FormData) {
  "use server"
  const session = await getServerSession(authOptions)
  if (!session) return
  const companyId = (session.user as any).companyId as string
  const role = (session.user as any).role as string
  if (role !== "OWNER" && role !== "ADMIN") return

  const userId = formData.get("userId") as string
  const month = parseInt(formData.get("month") as string)
  const year = parseInt(formData.get("year") as string)
  const targetAmount = parseFloat(formData.get("targetAmount") as string)

  if (!userId || isNaN(month) || isNaN(year) || isNaN(targetAmount) || targetAmount < 0) return

  await db.salesTarget.upsert({
    where: { companyId_userId_month_year: { companyId, userId, month, year } },
    update: { targetAmount },
    create: { companyId, userId, month, year, targetAmount },
  })
  revalidatePath("/reports/targets")
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

interface Props {
  searchParams: Promise<{ month?: string; year?: string }>
}

export default async function SalesTargetsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string
  const role = (session.user as any).role as string
  const isManager = role === "OWNER" || role === "ADMIN"

  const { month: monthParam, year: yearParam } = await searchParams
  const now = new Date()
  const month = monthParam ? parseInt(monthParam) : now.getMonth() + 1
  const year = yearParam ? parseInt(yearParam) : now.getFullYear()

  const fromDate = new Date(year, month - 1, 1)
  const toDate = new Date(year, month, 0, 23, 59, 59)

  // Get all active users
  const users = await db.user.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  })

  // Get targets for this month/year
  const targets = await db.salesTarget.findMany({
    where: { companyId, month, year },
  })
  const targetMap = new Map(targets.map((t) => [t.userId, parseFloat(t.targetAmount.toString())]))

  // Get actual sales per user this month
  const invoices = await db.saleInvoice.findMany({
    where: {
      companyId,
      invoiceDate: { gte: fromDate, lte: toDate },
    },
    select: { userId: true, netAmount: true, paidAmount: true },
  })

  type UserRow = {
    id: string
    name: string
    role: string
    target: number
    actualSales: number
    collected: number
    achievement: number
  }

  const salesMap = new Map<string, { sales: number; collected: number }>()
  for (const inv of invoices) {
    const net = parseFloat(inv.netAmount.toString())
    const paid = parseFloat(inv.paidAmount.toString())
    const existing = salesMap.get(inv.userId)
    if (existing) {
      existing.sales += net
      existing.collected += paid
    } else {
      salesMap.set(inv.userId, { sales: net, collected: paid })
    }
  }

  const rows: UserRow[] = users.map((u) => {
    const target = targetMap.get(u.id) ?? 0
    const actual = salesMap.get(u.id) ?? { sales: 0, collected: 0 }
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      target,
      actualSales: actual.sales,
      collected: actual.collected,
      achievement: target > 0 ? Math.round((actual.sales / target) * 100) : 0,
    }
  })

  const ROLE_LABELS: Record<string, string> = {
    OWNER: "Owner", ADMIN: "Admin", CASHIER: "Cashier", SALESMAN: "Salesman",
  }

  return (
    <div className="space-y-6">

      <div className="flex justify-end">
        <ReportExportButton report="targets" />
      </div>

      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Targets</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monthly targets and achievement per salesman</p>
        </div>
      </div>

      {/* Month/Year selector */}
      <form method="get" className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Month</label>
          <select name="month" defaultValue={month}
            className="block border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Year</label>
          <select name="year" defaultValue={year}
            className="block border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          View
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <p className="font-semibold text-slate-900">{MONTHS[month - 1]} {year}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-5 py-3 font-medium text-slate-600">Salesman</th>
              <th className="text-right px-5 py-3 font-medium text-slate-600">Target</th>
              <th className="text-right px-5 py-3 font-medium text-blue-700">Actual Sales</th>
              <th className="text-right px-5 py-3 font-medium text-green-700">Collected</th>
              <th className="text-right px-5 py-3 font-medium text-slate-600">Achievement</th>
              {isManager && <th className="px-5 py-3 font-medium text-slate-600">Set Target</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3">
                  <p className="font-semibold text-slate-800">{row.name}</p>
                  <p className="text-xs text-slate-400">{ROLE_LABELS[row.role] ?? row.role}</p>
                </td>
                <td className="px-5 py-3 text-right text-slate-600">
                  {row.target > 0 ? formatCurrency(row.target) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-5 py-3 text-right font-medium text-blue-700">{formatCurrency(row.actualSales)}</td>
                <td className="px-5 py-3 text-right font-medium text-green-700">{formatCurrency(row.collected)}</td>
                <td className="px-5 py-3 text-right">
                  {row.target > 0 ? (
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.achievement >= 100 ? "bg-green-500" : row.achievement >= 70 ? "bg-yellow-400" : "bg-red-400"}`}
                          style={{ width: `${Math.min(100, row.achievement)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold w-10 text-right ${row.achievement >= 100 ? "text-green-600" : row.achievement >= 70 ? "text-yellow-600" : "text-red-600"}`}>
                        {row.achievement}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">No target set</span>
                  )}
                </td>
                {isManager && (
                  <td className="px-5 py-3">
                    <form action={saveTarget} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={row.id} />
                      <input type="hidden" name="month" value={month} />
                      <input type="hidden" name="year" value={year} />
                      <input
                        type="number"
                        name="targetAmount"
                        defaultValue={row.target || ""}
                        placeholder="0"
                        min="0"
                        step="1000"
                        className="w-32 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button type="submit"
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
                        Save
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

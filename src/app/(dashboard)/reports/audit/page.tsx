import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ShieldCheck } from "lucide-react"
import { ReportExportButton } from "@/components/reports/report-export-button"
import { formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Activity Audit Log" }

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  LOGIN:           { label: "Login",            color: "bg-green-100 text-green-700" },
  VIEW_CUSTOMERS:  { label: "Viewed Customers", color: "bg-blue-100 text-blue-700" },
  VIEW_CUSTOMER:   { label: "Viewed Customer",  color: "bg-blue-50 text-blue-600" },
  VIEW_REPORT:     { label: "Viewed Report",    color: "bg-purple-100 text-purple-700" },
  CREATE_INVOICE:  { label: "Created Invoice",  color: "bg-slate-100 text-slate-700" },
  DELETE_INVOICE:  { label: "Deleted Invoice",  color: "bg-red-100 text-red-700" },
  CREATE_PURCHASE: { label: "Created Purchase", color: "bg-slate-100 text-slate-700" },
  CREATE_QUOTATION:{ label: "Created Quote",    color: "bg-slate-100 text-slate-700" },
  DELETE_QUOTATION:{ label: "Deleted Quote",    color: "bg-red-100 text-red-700" },
  CREATE_EXPENSE:  { label: "Created Expense",  color: "bg-slate-100 text-slate-700" },
  DELETE_EXPENSE:  { label: "Deleted Expense",  color: "bg-red-100 text-red-700" },
  // legacy
  CREATE:          { label: "Created",          color: "bg-slate-100 text-slate-700" },
  UPDATE:          { label: "Updated",          color: "bg-amber-100 text-amber-700" },
  DELETE:          { label: "Deleted",          color: "bg-red-100 text-red-700" },
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; days?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const role = (session.user as any).role as string
  const companyId = (session.user as any).companyId as string

  // Only OWNER and ADMIN can see the audit log
  if (role !== "OWNER" && role !== "ADMIN") redirect("/")

  const { user: userFilter, days: daysFilter } = await searchParams
  const days = Math.min(90, Math.max(1, parseInt(daysFilter ?? "7") || 7))
  const since = new Date(Date.now() - days * 86400_000)

  const [logs, users] = await Promise.all([
    db.auditLog.findMany({
      where: {
        companyId,
        createdAt: { gte: since },
        ...(userFilter ? { userId: userFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.user.findMany({
      where: { companyId },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ])

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      <div className="flex justify-end">
        <ReportExportButton report="audit" />
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-500" />
              Activity Audit Log
            </h1>
            <p className="text-sm text-slate-500">Every login, data view, and critical action — for the last {days} days</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="flex items-center gap-3 flex-wrap">
        <select
          name="days"
          defaultValue={String(days)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <select
          name="user"
          defaultValue={userFilter ?? ""}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Filter
        </button>
        {(userFilter || daysFilter) && (
          <Link
            href="/reports/audit"
            className="h-9 px-4 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 flex items-center transition-colors"
          >
            Clear
          </Link>
        )}
        <span className="text-xs text-slate-400 ml-auto">{logs.length} events</span>
      </form>

      {/* Log table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {logs.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldCheck className="h-8 w-8 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No activity in this period</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Time</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">User</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Action</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Detail</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((log) => {
                const actionMeta = ACTION_LABELS[log.action] ?? { label: log.action, color: "bg-slate-100 text-slate-600" }
                return (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {log.createdAt.toLocaleString("en-PK", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {log.userName || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${actionMeta.color}`}>
                        {actionMeta.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {log.detail ?? log.entity ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs font-mono">
                      {log.ipAddress ?? "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Audit logs are retained for 90 days. Only OWNER and ADMIN roles can view this page.
      </p>
    </div>
  )
}

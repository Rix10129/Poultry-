import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import { logAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"
export const metadata = { title: "Customer Recovery" }

const TYPE_LABELS: Record<string, string> = {
  FARM: "Farm",
  VET_SHOP: "Vet Shop",
  SUB_DEALER: "Sub-Dealer",
  RETAIL: "Retail",
}

export default async function RecoveryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; area?: string; all?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { type, area, all } = await searchParams
  const showAll = all === "1"

  logAudit({
    companyId,
    userId: (session.user as any).id,
    userName: (session.user as any).name ?? "",
    action: "VIEW_REPORT",
    detail: "Customer Recovery Report",
  })

  const customers = await db.customer.findMany({
    where: {
      companyId,
      ...(type ? { type: type as any } : {}),
      ...(area ? { area: { contains: area, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      invoices: { select: { netAmount: true, paidAmount: true } },
      payments: { select: { amount: true } },
    },
  })

  const rows = customers
    .map((c) => {
      const totalInvoiced = c.invoices.reduce(
        (s, i) => s + parseFloat(i.netAmount.toString()),
        0
      )
      const totalPaid = c.invoices.reduce(
        (s, i) => s + parseFloat(i.paidAmount.toString()),
        0
      )
      const opening = parseFloat(c.openingBalance.toString())
      const outstanding = opening + totalInvoiced - totalPaid
      return { customer: c, opening, totalInvoiced, totalPaid, outstanding }
    })
    .filter((r) => showAll || r.outstanding > 0.001)
    .sort((a, b) => b.outstanding - a.outstanding)

  const grandOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)
  const grandInvoiced = rows.reduce((s, r) => s + r.totalInvoiced, 0)

  // Unique areas for filter
  const areas = [...new Set(customers.map((c) => c.area).filter(Boolean) as string[])].sort()

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Recovery</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {rows.length} customer{rows.length !== 1 ? "s" : ""} with outstanding balance
          </p>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3">
        <select
          name="type"
          defaultValue={type ?? ""}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {areas.length > 0 && (
          <select
            name="area"
            defaultValue={area ?? ""}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" name="all" value="1" defaultChecked={showAll} />
          Show zero-balance
        </label>
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        {(type || area || showAll) && (
          <Link href="/reports/recovery">
            <Button variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Customers</p>
          <p className="text-2xl font-bold text-slate-900">{rows.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">with outstanding balance</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Invoiced</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(grandInvoiced)}</p>
          <p className="text-xs text-slate-400 mt-0.5">in the selected group</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(grandOutstanding)}</p>
          <p className="text-xs text-slate-400 mt-0.5">total receivables</p>
        </div>
      </div>

      {/* Customer table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No customers with outstanding balance</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">#</th>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Customer</th>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Type</th>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Area</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Opening</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Invoiced</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Paid</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ customer, opening, totalInvoiced, totalPaid, outstanding }, idx) => (
                <tr
                  key={customer.id}
                  className={`hover:bg-slate-50 ${outstanding > 50000 ? "bg-orange-50/30" : ""}`}
                >
                  <td className="px-5 py-2.5 text-slate-400 text-xs">{idx + 1}</td>
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-medium text-blue-600 hover:text-blue-700"
                    >
                      {customer.name}
                    </Link>
                    {customer.phone && (
                      <p className="text-xs text-slate-400">{customer.phone}</p>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-slate-500 text-xs">
                    {TYPE_LABELS[customer.type] ?? customer.type}
                  </td>
                  <td className="px-5 py-2.5 text-slate-500 text-xs">{customer.area ?? "—"}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-slate-600">
                    {opening !== 0 ? formatCurrency(opening) : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-slate-900">
                    {formatCurrency(totalInvoiced)}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-green-700">
                    {formatCurrency(totalPaid)}
                  </td>
                  <td className="px-5 py-2.5 text-right font-bold font-mono text-orange-600">
                    {formatCurrency(outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={5} className="px-5 py-2.5 text-sm font-semibold text-right text-slate-700">
                  Totals
                </td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-slate-900">
                  {formatCurrency(grandInvoiced)}
                </td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-green-700">
                  {formatCurrency(rows.reduce((s, r) => s + r.totalPaid, 0))}
                </td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-orange-600">
                  {formatCurrency(grandOutstanding)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

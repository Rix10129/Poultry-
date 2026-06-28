import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import Link from "next/link"
import {
  Package, Users, Building2, TrendingUp, AlertTriangle,
  CheckCircle2, Circle, FileText, ArrowRight,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

async function getStats(companyId: string) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const in90 = new Date(now.getTime() + 90 * 86400_000)

  const [
    todayInvoices,
    monthInvoices,
    allCustomers,
    totalProducts,
    expiringBatches,
    products,
    recentInvoices,
  ] = await Promise.all([
    db.saleInvoice.aggregate({
      where: { companyId, invoiceDate: { gte: todayStart } },
      _sum: { netAmount: true },
      _count: true,
    }),
    db.saleInvoice.aggregate({
      where: { companyId, invoiceDate: { gte: monthStart } },
      _sum: { netAmount: true },
      _count: true,
    }),
    db.customer.findMany({
      where: { companyId },
      select: {
        openingBalance: true,
        invoices: { select: { netAmount: true, paidAmount: true } },
      },
    }),
    db.product.count({ where: { companyId, isActive: true } }),
    db.productBatch.count({
      where: { companyId, expiryDate: { lte: in90 }, quantity: { gt: 0 } },
    }),
    db.product.findMany({
      where: { companyId, isActive: true },
      select: { reorderLevel: true, batches: { select: { quantity: true } } },
    }),
    db.saleInvoice.findMany({
      where: { companyId },
      orderBy: { invoiceDate: "desc" },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        netAmount: true,
        paidAmount: true,
        customer: { select: { name: true } },
      },
    }),
  ])

  const totalReceivables = allCustomers.reduce((sum, c) => {
    const net = c.invoices.reduce((s, inv) => s + parseFloat(inv.netAmount.toString()), 0)
    const paid = c.invoices.reduce((s, inv) => s + parseFloat(inv.paidAmount.toString()), 0)
    return sum + parseFloat(c.openingBalance.toString()) + net - paid
  }, 0)

  const lowStockCount = products.filter(
    (p) => p.batches.reduce((s, b) => s + b.quantity, 0) <= p.reorderLevel
  ).length

  return {
    todaySales: parseFloat(todayInvoices._sum.netAmount?.toString() ?? "0"),
    todayCount: todayInvoices._count,
    monthSales: parseFloat(monthInvoices._sum.netAmount?.toString() ?? "0"),
    monthCount: monthInvoices._count,
    totalReceivables: Math.max(0, totalReceivables),
    totalProducts,
    alertCount: expiringBatches + lowStockCount,
    recentInvoices,
  }
}

const modules = [
  { n: 1, name: "Project Setup & Auth",          status: "done" },
  { n: 2, name: "Inventory Management",           status: "done" },
  { n: 3, name: "Expiry & Low-Stock Alerts",      status: "done" },
  { n: 4, name: "Sales & Invoicing",              status: "done" },
  { n: 5, name: "Purchases & Suppliers",          status: "done" },
  { n: 6, name: "Customers & Ledger",             status: "done" },
  { n: 7, name: "Accounts & Vouchers",            status: "done" },
  { n: 8, name: "Reports & Dashboard",            status: "done" },
  { n: 9, name: "Users & Roles",                  status: "done" },
]

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const companyId = (session?.user as any)?.companyId as string | undefined
  const stats = companyId ? await getStats(companyId) : null
  const firstName = session?.user?.name?.split(" ")[0] ?? "there"
  const doneCount = modules.filter((m) => m.status === "done").length

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome back, {firstName}</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {doneCount} of 9 modules complete
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Today's Sales"
          value={stats ? formatCurrency(stats.todaySales) : "—"}
          sub={stats ? `${stats.todayCount} invoice${stats.todayCount !== 1 ? "s" : ""}` : ""}
          color="blue"
          href="/sales"
        />
        <KpiCard
          label="This Month"
          value={stats ? formatCurrency(stats.monthSales) : "—"}
          sub={stats ? `${stats.monthCount} invoice${stats.monthCount !== 1 ? "s" : ""}` : ""}
          color="green"
          href="/reports/sales"
        />
        <KpiCard
          label="Receivables"
          value={stats ? formatCurrency(stats.totalReceivables) : "—"}
          sub="outstanding from customers"
          color="orange"
          href="/reports/recovery"
          alert={!!stats && stats.totalReceivables > 0}
        />
        <KpiCard
          label="Alerts"
          value={stats ? String(stats.alertCount) : "—"}
          sub="expiring / low stock"
          color="red"
          href="/alerts"
          alert={!!stats && stats.alertCount > 0}
        />
      </div>

      {/* Recent invoices + quick links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent invoices */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent Invoices</h2>
            <Link href="/sales" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {!stats || stats.recentInvoices.length === 0 ? (
            <div className="py-10 text-center">
              <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No invoices yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-50">
                {stats.recentInvoices.map((inv) => {
                  const net = parseFloat(inv.netAmount.toString())
                  const paid = parseFloat(inv.paidAmount.toString())
                  const bal = net - paid
                  const isPaid = bal <= 0.001
                  const isPartial = !isPaid && paid > 0.001
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5">
                        <Link href={`/sales/${inv.id}`} className="font-mono font-semibold text-blue-600 hover:text-blue-700 text-xs">
                          {inv.invoiceNumber}
                        </Link>
                        <p className="text-xs text-slate-400 mt-0.5">{formatDate(inv.invoiceDate)}</p>
                      </td>
                      <td className="px-5 py-2.5 text-slate-600 text-xs">
                        {inv.customer?.name ?? <span className="italic text-slate-400">Walk-in</span>}
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold text-slate-900 text-sm">
                        {formatCurrency(net)}
                      </td>
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
            </table>
          )}
        </div>

        {/* Quick links */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 px-1">Quick Links</h2>
          {[
            { label: "New Invoice", href: "/sales/new", icon: FileText, color: "text-blue-600 bg-blue-50" },
            { label: "New Purchase", href: "/purchases/new", icon: Package, color: "text-purple-600 bg-purple-50" },
            { label: "Customers", href: "/customers", icon: Users, color: "text-green-600 bg-green-50" },
            { label: "Suppliers", href: "/suppliers", icon: Building2, color: "text-slate-600 bg-slate-100" },
            { label: "Reports", href: "/reports", icon: TrendingUp, color: "text-orange-600 bg-orange-50" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className={`p-2 rounded-lg ${link.color}`}>
                <link.icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-slate-700">{link.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400 ml-auto" />
            </Link>
          ))}
        </div>
      </div>

      {/* Module progress */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Build Progress</h2>
          <span className="px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full border border-green-200">
            {doneCount} / 9 complete
          </span>
        </div>
        <ul className="divide-y divide-slate-50">
          {modules.map((mod) => (
            <li key={mod.n} className="flex items-center gap-4 px-6 py-3">
              <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-500 shrink-0">
                {mod.n}
              </div>
              <p className="text-sm text-slate-700 flex-1">{mod.name}</p>
              <StatusBadge status={mod.status} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function KpiCard({
  label, value, sub, color, href, alert,
}: {
  label: string; value: string; sub: string
  color: "blue" | "green" | "orange" | "red"
  href?: string; alert?: boolean
}) {
  const colors = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
    orange: "bg-orange-50 text-orange-600",
    red:    "bg-red-50 text-red-600",
  }
  const content = (
    <div className={`bg-white rounded-xl border ${alert ? "border-orange-200" : "border-slate-200"} p-5 hover:border-slate-300 transition-colors`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        {alert && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : <>{content}</>
}

function StatusBadge({ status }: { status: string }) {
  if (status === "done")
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-green-50 text-green-700 rounded-full border border-green-200 shrink-0">
        <CheckCircle2 className="w-3 h-3" /> Done
      </span>
    )
  if (status === "next")
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-full border border-blue-200 shrink-0">
        <Circle className="w-2.5 h-2.5 fill-blue-500" /> Up next
      </span>
    )
  return (
    <span className="px-2 py-0.5 text-xs text-slate-400 rounded-full border border-slate-200 shrink-0">
      Pending
    </span>
  )
}

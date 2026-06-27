import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import Link from "next/link"
import { Package, Users, Building2, Clock, AlertTriangle, CheckCircle2, Circle } from "lucide-react"

async function getStats(companyId: string) {
  const now = new Date()
  const in90 = new Date(now.getTime() + 90 * 86400_000)

  const [totalProducts, totalCustomers, totalSuppliers, expiringBatches, products] =
    await Promise.all([
      db.product.count({ where: { companyId, isActive: true } }),
      db.customer.count({ where: { companyId } }),
      db.supplier.count({ where: { companyId } }),
      db.productBatch.count({
        where: { companyId, expiryDate: { lte: in90 }, quantity: { gt: 0 } },
      }),
      db.product.findMany({
        where: { companyId, isActive: true },
        select: { reorderLevel: true, batches: { select: { quantity: true } } },
      }),
    ])

  const lowStockCount = products.filter(
    (p) => p.batches.reduce((s, b) => s + b.quantity, 0) <= p.reorderLevel
  ).length

  return { totalProducts, totalCustomers, totalSuppliers, expiringBatches, lowStockCount }
}

const modules = [
  { n: 1, name: "Project Setup & Auth",          desc: "DB schema, multi-tenant, roles, login",                    status: "done" },
  { n: 2, name: "Inventory Management",           desc: "Products, batches, multi-unit, FEFO stock tracking",       status: "done" },
  { n: 3, name: "Expiry & Low-Stock Alerts",      desc: "FEFO heatmap, 90/60/30-day urgency, reorder dashboard",   status: "done" },
  { n: 4, name: "Sales & Invoicing",              desc: "Invoice builder, FEFO auto-pick, PDF, WhatsApp link",      status: "next" },
  { n: 5, name: "Purchases & Suppliers",          desc: "Purchase orders, returns, supplier ledger",                status: "pending" },
  { n: 6, name: "Customers & Ledger",             desc: "Customer ledger, outstanding balance, recovery tracker",   status: "pending" },
  { n: 7, name: "Accounts",                       desc: "Double-entry vouchers, day book, P&L, trial balance",      status: "pending" },
  { n: 8, name: "Reports & Dashboard",            desc: "Sales summary, stock valuation, salesman-wise reports",    status: "pending" },
  { n: 9, name: "Users & Roles",                  desc: "Permission matrix, audit log, role management",            status: "pending" },
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
          {doneCount} of 9 modules complete — {modules.find((m) => m.status === "next")?.name} is up next.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Products" value={stats?.totalProducts} icon={Package} color="blue" />
        <StatCard label="Customers" value={stats?.totalCustomers} icon={Users} color="green" />
        <StatCard label="Suppliers" value={stats?.totalSuppliers} icon={Building2} color="purple" />
        <StatCard
          label="Alerts"
          value={stats ? stats.expiringBatches + stats.lowStockCount : undefined}
          icon={Clock}
          color="orange"
          alert={!!stats && stats.expiringBatches + stats.lowStockCount > 0}
          href="/alerts"
        />
      </div>

      {/* Module roadmap */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Build Roadmap</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Modules delivered one at a time — confirm each before the next begins.
            </p>
          </div>
          <span className="px-2.5 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full border border-green-200">
            {doneCount} / 9 complete
          </span>
        </div>

        <ul className="divide-y divide-slate-100">
          {modules.map((mod) => (
            <li key={mod.n} className="flex items-center gap-4 px-6 py-3.5">
              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-500 shrink-0">
                {mod.n}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{mod.name}</p>
                <p className="text-xs text-slate-500 truncate">{mod.desc}</p>
              </div>
              <StatusBadge status={mod.status} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function StatCard({
  label, value, icon: Icon, color, alert, href,
}: {
  label: string
  value?: number
  icon: React.ComponentType<{ className?: string }>
  color: "blue" | "green" | "purple" | "orange"
  alert?: boolean
  href?: string
}) {
  const bg = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  }
  const card = (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${href ? "hover:border-slate-300 transition-colors" : ""}`}>
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${bg[color]}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        {alert && <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5" />}
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value ?? "—"}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
  return href ? <Link href={href}>{card}</Link> : card
}

function StatusBadge({ status }: { status: string }) {
  if (status === "done")
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-green-50 text-green-700 rounded-full border border-green-200 shrink-0">
        <CheckCircle2 className="w-3 h-3" />
        Done
      </span>
    )
  if (status === "next")
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 rounded-full border border-blue-200 shrink-0">
        <Circle className="w-2.5 h-2.5 fill-blue-500" />
        Up next
      </span>
    )
  return (
    <span className="px-2.5 py-1 text-xs font-medium text-slate-400 rounded-full border border-slate-200 shrink-0">
      Pending
    </span>
  )
}

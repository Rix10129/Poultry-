import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ExpiryBadge } from "@/components/inventory/expiry-badge"
import { formatDate, daysUntilExpiry } from "@/lib/utils"

export const metadata = { title: "Alerts" }
export const dynamic = "force-dynamic"

async function getAlerts(companyId: string) {
  const now = new Date()
  const in90 = new Date(now.getTime() + 90 * 86400_000)

  const [urgentBatches, products] = await Promise.all([
    db.productBatch.findMany({
      where: { companyId, expiryDate: { lte: in90 }, quantity: { gt: 0 } },
      include: {
        product: {
          select: { id: true, name: true, unit: true, category: { select: { name: true } } },
        },
      },
      orderBy: { expiryDate: "asc" },
    }),
    db.product.findMany({
      where: { companyId, isActive: true },
      include: {
        category: { select: { name: true } },
        batches: { select: { quantity: true } },
      },
    }),
  ])

  const expiredBatches = urgentBatches.filter((b) => b.expiryDate < now)
  const expiringBatches = urgentBatches.filter((b) => b.expiryDate >= now)
  const criticalBatches = expiringBatches.filter((b) => daysUntilExpiry(b.expiryDate) <= 30)
  const warningBatches = expiringBatches.filter((b) => {
    const d = daysUntilExpiry(b.expiryDate)
    return d > 30 && d <= 60
  })
  const cautionBatches = expiringBatches.filter((b) => daysUntilExpiry(b.expiryDate) > 60)

  const lowStockProducts = products
    .map((p) => ({ ...p, totalStock: p.batches.reduce((s, b) => s + b.quantity, 0) }))
    .filter((p) => p.totalStock <= p.reorderLevel)
    .sort((a, b) => b.reorderLevel - b.totalStock - (a.reorderLevel - a.totalStock))

  return { expiredBatches, criticalBatches, warningBatches, cautionBatches, lowStockProducts }
}

export default async function AlertsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { expiredBatches, criticalBatches, warningBatches, cautionBatches, lowStockProducts } =
    await getAlerts(companyId)

  const totalAlerts =
    expiredBatches.length +
    criticalBatches.length +
    warningBatches.length +
    cautionBatches.length +
    lowStockProducts.length

  const allClear = totalAlerts === 0

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Alerts</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {allClear
            ? "All clear — no active alerts"
            : `${totalAlerts} alert${totalAlerts !== 1 ? "s" : ""} require attention`}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard count={expiredBatches.length} label="Expired stock" variant="danger" />
        <SummaryCard count={criticalBatches.length} label="Critical ≤ 30 days" variant="warning" />
        <SummaryCard count={warningBatches.length + cautionBatches.length} label="Expiring ≤ 90 days" variant="caution" />
        <SummaryCard count={lowStockProducts.length} label="Low / out of stock" variant="info" />
      </div>

      {allClear && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="font-semibold text-green-800">All clear!</p>
          <p className="text-sm text-green-600 mt-1">No expiry or stock level alerts at this time.</p>
        </div>
      )}

      {expiredBatches.length > 0 && (
        <AlertSection
          title="Expired Stock in Hand"
          count={expiredBatches.length}
          severity="danger"
          description="These batches have expired but still have quantity in stock. Quarantine or write off."
        >
          <BatchTable batches={expiredBatches} />
        </AlertSection>
      )}

      {criticalBatches.length > 0 && (
        <AlertSection
          title="Critical — Expires within 30 days"
          count={criticalBatches.length}
          severity="warning"
        >
          <BatchTable batches={criticalBatches} />
        </AlertSection>
      )}

      {warningBatches.length > 0 && (
        <AlertSection
          title="Warning — Expires in 31–60 days"
          count={warningBatches.length}
          severity="caution"
        >
          <BatchTable batches={warningBatches} />
        </AlertSection>
      )}

      {cautionBatches.length > 0 && (
        <AlertSection
          title="Caution — Expires in 61–90 days"
          count={cautionBatches.length}
          severity="info"
        >
          <BatchTable batches={cautionBatches} />
        </AlertSection>
      )}

      {lowStockProducts.length > 0 && (
        <AlertSection
          title="Low Stock"
          count={lowStockProducts.length}
          severity="info"
          description="Products at or below their reorder level. Consider placing purchase orders."
        >
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600">Product</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600">Category</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Current Stock</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Reorder Level</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Deficit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lowStockProducts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/inventory/${p.id}`}
                      className="font-medium text-slate-900 hover:text-blue-600"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{p.category?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={
                        p.totalStock === 0
                          ? "font-bold text-red-600"
                          : "font-semibold text-amber-600"
                      }
                    >
                      {p.totalStock}
                    </span>
                    <span className="text-slate-400 text-xs ml-1">{p.unit.toLowerCase()}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{p.reorderLevel}</td>
                  <td className="px-4 py-2.5 text-right">
                    {p.totalStock === 0 ? (
                      <Badge variant="danger">Out of stock</Badge>
                    ) : (
                      <span className="font-semibold text-amber-600">
                        −{p.reorderLevel - p.totalStock}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AlertSection>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

type Severity = "danger" | "warning" | "caution" | "info"

function SummaryCard({ count, label, variant }: { count: number; label: string; variant: Severity }) {
  const styles: Record<Severity, { wrap: string; num: string }> = {
    danger:  { wrap: "bg-red-50 border-red-200",    num: "text-red-600" },
    warning: { wrap: "bg-amber-50 border-amber-200", num: "text-amber-600" },
    caution: { wrap: "bg-orange-50 border-orange-200", num: "text-orange-600" },
    info:    { wrap: "bg-blue-50 border-blue-200",   num: "text-blue-600" },
  }
  return (
    <div className={`rounded-xl border p-4 ${styles[variant].wrap}`}>
      <p className={`text-3xl font-bold ${styles[variant].num}`}>{count}</p>
      <p className="text-xs font-medium text-slate-600 mt-1">{label}</p>
    </div>
  )
}

function AlertSection({
  title, count, severity, description, children,
}: {
  title: string
  count: number
  severity: Severity
  description?: string
  children: React.ReactNode
}) {
  const headerStyles: Record<Severity, string> = {
    danger:  "border-red-200 bg-red-50",
    warning: "border-amber-200 bg-amber-50",
    caution: "border-orange-200 bg-orange-50",
    info:    "border-blue-200 bg-blue-50",
  }
  const titleStyles: Record<Severity, string> = {
    danger:  "text-red-800",
    warning: "text-amber-800",
    caution: "text-orange-800",
    info:    "text-blue-800",
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className={`px-4 py-3 border-b ${headerStyles[severity]}`}>
        <div className="flex items-center justify-between">
          <h2 className={`font-semibold text-sm ${titleStyles[severity]}`}>{title}</h2>
          <Badge variant={severity === "caution" ? "caution" : severity}>
            {count} item{count !== 1 ? "s" : ""}
          </Badge>
        </div>
        {description && <p className="text-xs text-slate-600 mt-0.5 opacity-75">{description}</p>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

type BatchWithProduct = {
  id: string
  batchNumber: string
  expiryDate: Date
  quantity: number
  product: { id: string; name: string; unit: string; category: { name: string } | null }
}

function BatchTable({ batches }: { batches: BatchWithProduct[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-200">
        <tr>
          <th className="text-left px-4 py-2.5 font-medium text-slate-600">Product</th>
          <th className="text-left px-4 py-2.5 font-medium text-slate-600">Category</th>
          <th className="text-left px-4 py-2.5 font-medium text-slate-600">Batch #</th>
          <th className="text-left px-4 py-2.5 font-medium text-slate-600">Expiry Date</th>
          <th className="text-right px-4 py-2.5 font-medium text-slate-600">Stock</th>
          <th className="text-left px-4 py-2.5 font-medium text-slate-600">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {batches.map((batch) => (
          <tr key={batch.id} className="hover:bg-slate-50">
            <td className="px-4 py-2.5">
              <Link
                href={`/inventory/${batch.product.id}`}
                className="font-medium text-slate-900 hover:text-blue-600"
              >
                {batch.product.name}
              </Link>
            </td>
            <td className="px-4 py-2.5 text-slate-500 text-xs">{batch.product.category?.name ?? "—"}</td>
            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">
              {batch.batchNumber}
            </td>
            <td className="px-4 py-2.5 text-slate-600 text-xs">{formatDate(batch.expiryDate)}</td>
            <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
              {batch.quantity}{" "}
              <span className="text-xs text-slate-400 font-normal">
                {batch.product.unit.toLowerCase()}
              </span>
            </td>
            <td className="px-4 py-2.5">
              <ExpiryBadge expiryDate={batch.expiryDate} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

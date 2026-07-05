import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { OfflineBanner } from "@/components/offline-banner"

async function getAlertCount(companyId: string): Promise<number> {
  const now = new Date()
  const in90 = new Date(now.getTime() + 90 * 86400_000)

  const [expiringCount, products] = await Promise.all([
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

  return expiringCount + lowStockCount
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const user = session.user as any
  const companyId = user?.companyId as string | undefined
  const role = user?.role as string | undefined

  // Single-session enforcement: if someone logged in elsewhere, boot this session
  if (user?.id && user?.activeSessionId) {
    const dbUser = await db.user.findFirst({
      where: { id: user.id },
      select: { activeSessionId: true },
    })
    if (dbUser?.activeSessionId && dbUser.activeSessionId !== user.activeSessionId) {
      redirect("/login?reason=session_replaced")
    }
  }

  const [alertCount, company] = await Promise.all([
    companyId ? getAlertCount(companyId) : Promise.resolve(0),
    companyId
      ? db.company.findUnique({ where: { id: companyId }, select: { name: true, logoUrl: true } })
      : Promise.resolve(null),
  ])

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        alertCount={alertCount}
        role={role}
        companyName={company?.name}
        logoUrl={company?.logoUrl}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar session={session} alertCount={alertCount} />
        <OfflineBanner />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}

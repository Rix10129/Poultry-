import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { StockAdjustmentForm } from "@/components/inventory/stock-adjustment-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "Stock Adjustment" }

export default async function StockAdjustmentPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const products = await db.product.findMany({
    where: { companyId, isActive: true },
    include: {
      batches: {
        where: { quantity: { gt: 0 } },
        select: { id: true, batchNumber: true, quantity: true, expiryDate: true },
        orderBy: { expiryDate: "asc" },
      },
    },
    orderBy: { name: "asc" },
  })

  const productsWithBatches = products.filter((p) => p.batches.length > 0)

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/inventory" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stock Adjustment</h1>
          <p className="text-sm text-slate-500">Correct stock for damage, expiry write-off, or count correction</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <StockAdjustmentForm products={productsWithBatches} />
      </div>
    </div>
  )
}

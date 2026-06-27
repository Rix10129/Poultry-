import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { PurchaseForm } from "@/components/purchases/purchase-form"

export const metadata = { title: "New Purchase" }

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { supplierId } = await searchParams

  const [rawProducts, suppliers] = await Promise.all([
    db.product.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        taxRate: true,
        purchasePrice: true,
        salePrice: true,
      },
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const products = rawProducts.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    taxRate: p.taxRate.toString(),
    purchasePrice: p.purchasePrice.toString(),
    salePrice: p.salePrice.toString(),
  }))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/purchases" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Purchase Order</h1>
          <p className="text-sm text-slate-500">Receive stock from a supplier</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <PurchaseForm
          products={products}
          suppliers={suppliers}
          defaultSupplierId={supplierId ?? ""}
        />
      </div>
    </div>
  )
}

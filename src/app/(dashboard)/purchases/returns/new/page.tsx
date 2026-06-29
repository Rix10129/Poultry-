import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { PurchaseReturnForm } from "@/components/purchases/purchase-return-form"

export const metadata = { title: "New Purchase Return" }

interface Props {
  searchParams: Promise<{ supplierId?: string }>
}

export default async function NewPurchaseReturnPage({ searchParams }: Props) {
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
        batches: {
          where: { quantity: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true,
            quantity: true,
            purchasePrice: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const products = rawProducts
    .filter((p) => p.batches.length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      batches: p.batches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate.toISOString(),
        quantity: b.quantity,
        purchasePrice: b.purchasePrice.toString(),
      })),
    }))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/purchases/returns" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Purchase Return</h1>
          <p className="text-sm text-slate-500">Return goods to a supplier</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <PurchaseReturnForm
          products={products}
          suppliers={suppliers}
          defaultSupplierId={supplierId}
        />
      </div>
    </div>
  )
}

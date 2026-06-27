import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ProductForm } from "@/components/inventory/product-form"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const p = await db.product.findUnique({ where: { id }, select: { name: true } })
  return { title: `Edit ${p?.name ?? "Product"}` }
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [product, categories, suppliers] = await Promise.all([
    db.product.findFirst({ where: { id, companyId, isActive: true } }),
    db.category.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])
  if (!product) notFound()

  // Serialize Decimal fields before passing to client component
  const serialized = {
    id: product.id,
    name: product.name,
    genericName: product.genericName,
    categoryId: product.categoryId,
    supplierId: product.supplierId,
    species: product.species,
    unit: product.unit,
    subUnit: product.subUnit,
    unitsPerPack: product.unitsPerPack,
    salePrice: product.salePrice.toString(),
    purchasePrice: product.purchasePrice.toString(),
    reorderLevel: product.reorderLevel,
    taxRate: product.taxRate.toString(),
    description: product.description,
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/inventory/${id}`} className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Edit Product</h1>
          <p className="text-sm text-slate-500">{product.name}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <ProductForm categories={categories} suppliers={suppliers} product={serialized} />
      </div>
    </div>
  )
}

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BatchSection } from "@/components/inventory/batch-section"
import { formatCurrency, formatDate } from "@/lib/utils"
import { deleteProduct } from "@/app/(dashboard)/inventory/actions"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const p = await db.product.findUnique({ where: { id }, select: { name: true } })
  return { title: p?.name ?? "Product" }
}

function cap(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase()
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const product = await db.product.findFirst({
    where: { id, companyId, isActive: true },
    include: {
      category: true,
      supplier: true,
      batches: { orderBy: { expiryDate: "asc" } },
    },
  })
  if (!product) notFound()

  const totalStock = product.batches.reduce((s, b) => s + b.quantity, 0)
  const isLow = totalStock <= product.reorderLevel

  // Serialize Decimal fields before passing to client components
  const batches = product.batches.map((b) => ({
    id: b.id,
    batchNumber: b.batchNumber,
    manufactureDate: b.manufactureDate,
    expiryDate: b.expiryDate,
    purchasePrice: b.purchasePrice.toString(),
    salePrice: b.salePrice.toString(),
    quantity: b.quantity,
    initialQuantity: b.initialQuantity,
  }))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
            {product.genericName && (
              <p className="text-sm text-slate-500 mt-0.5">{product.genericName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/inventory/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          <form action={deleteProduct.bind(null, id)}>
            <Button variant="destructive" size="sm" type="submit">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </form>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500 font-medium">Total Stock</p>
          <p className={`text-3xl font-bold mt-1 ${isLow ? "text-red-600" : "text-slate-900"}`}>
            {totalStock}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{product.unit.toLowerCase()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500 font-medium">Sale Price</p>
          <p className="text-xl font-bold text-slate-900 mt-1">
            {formatCurrency(product.salePrice.toString())}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">per {product.unit.toLowerCase()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500 font-medium">Reorder Level</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{product.reorderLevel}</p>
          {isLow && <Badge variant="danger" className="mt-1.5">Below threshold</Badge>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500 font-medium">Batches</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{product.batches.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">active batches</p>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Product Details</h2>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Category</dt>
            <dd className="font-medium text-slate-900 mt-0.5">{product.category?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Species</dt>
            <dd className="mt-0.5"><Badge variant="info">{cap(product.species)}</Badge></dd>
          </div>
          <div>
            <dt className="text-slate-500">Supplier</dt>
            <dd className="font-medium text-slate-900 mt-0.5">{product.supplier?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Unit</dt>
            <dd className="font-medium text-slate-900 mt-0.5">{cap(product.unit)}</dd>
          </div>
          {product.subUnit && (
            <div>
              <dt className="text-slate-500">Sub Unit</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{cap(product.subUnit)}</dd>
            </div>
          )}
          {product.unitsPerPack && (
            <div>
              <dt className="text-slate-500">Units / Pack</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{product.unitsPerPack}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">Purchase Price</dt>
            <dd className="font-medium text-slate-900 mt-0.5">{formatCurrency(product.purchasePrice.toString())}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Tax Rate</dt>
            <dd className="font-medium text-slate-900 mt-0.5">{product.taxRate.toString()}%</dd>
          </div>
          <div>
            <dt className="text-slate-500">Added</dt>
            <dd className="font-medium text-slate-900 mt-0.5">{formatDate(product.createdAt)}</dd>
          </div>
          {product.description && (
            <div className="col-span-2 md:col-span-3">
              <dt className="text-slate-500">Description</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{product.description}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Batches */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <BatchSection productId={id} batches={batches} />
      </div>
    </div>
  )
}

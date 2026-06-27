import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Search, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Species } from "@prisma/client"

export const metadata = { title: "Inventory" }

const SPECIES_LIST = ["BROILER", "LAYER", "CATTLE", "SHEEP", "GOAT", "FISH", "GENERAL"]

function cap(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase()
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; species?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { q, species } = await searchParams

  const products = await db.product.findMany({
    where: {
      companyId,
      isActive: true,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(species && SPECIES_LIST.includes(species) ? { species: species as Species } : {}),
    },
    include: {
      category: { select: { name: true } },
      batches: { select: { quantity: true, expiryDate: true } },
    },
    orderBy: { name: "asc" },
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {products.length} product{products.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/inventory/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Product
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search products…"
            className="pl-9 h-9 w-64 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          name="species"
          defaultValue={species ?? ""}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All species</option>
          {SPECIES_LIST.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
        </select>
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        {(q || species) && (
          <Link href="/inventory">
            <Button variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      {/* Table */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No products found</p>
          <p className="text-sm text-slate-400 mt-1">
            {q || species ? "Try a different filter" : "Add your first product to get started"}
          </p>
          {!q && !species && (
            <Link href="/inventory/new" className="mt-4">
              <Button><Plus className="h-4 w-4" />Add Product</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Product</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Species</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Stock</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Sale Price</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((product) => {
                const totalStock = product.batches.reduce((s, b) => s + b.quantity, 0)
                const isLow = totalStock <= product.reorderLevel
                return (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/inventory/${product.id}`}
                        className="font-medium text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {product.name}
                      </Link>
                      {product.genericName && (
                        <p className="text-xs text-slate-400 mt-0.5">{product.genericName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{product.category?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{cap(product.species)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={isLow ? "font-bold text-red-600" : "font-semibold text-slate-900"}>
                        {totalStock}
                      </span>
                      <span className="text-slate-400 text-xs ml-1">{product.unit.toLowerCase()}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatCurrency(product.salePrice.toString())}
                    </td>
                    <td className="px-4 py-3">
                      {totalStock === 0
                        ? <Badge variant="danger">Out of Stock</Badge>
                        : isLow
                        ? <Badge variant="warning">Low Stock</Badge>
                        : <Badge variant="success">In Stock</Badge>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

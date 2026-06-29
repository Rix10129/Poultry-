import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, AlertTriangle, Printer } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Reorder Sheet" }

export default async function ReorderSheetPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const products = await db.product.findMany({
    where: { companyId, isActive: true },
    include: {
      batches: { select: { quantity: true, purchasePrice: true, expiryDate: true } },
      supplier: { select: { id: true, name: true, phone: true } },
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  })

  type ReorderItem = {
    id: string
    name: string
    category: string | null
    currentStock: number
    reorderLevel: number
    deficit: number
    purchasePrice: number
    supplierName: string | null
    supplierPhone: string | null
    supplierId: string | null
    unit: string
  }

  const reorderItems: ReorderItem[] = []

  for (const p of products) {
    const currentStock = p.batches.reduce((s, b) => s + b.quantity, 0)
    if (currentStock > p.reorderLevel) continue

    // Use latest batch purchase price as reference
    const latestBatch = p.batches.length > 0 ? p.batches[p.batches.length - 1] : null
    const purchasePrice = latestBatch
      ? parseFloat(latestBatch.purchasePrice.toString())
      : parseFloat(p.purchasePrice.toString())

    reorderItems.push({
      id: p.id,
      name: p.name,
      category: p.category?.name ?? null,
      currentStock,
      reorderLevel: p.reorderLevel,
      deficit: Math.max(0, p.reorderLevel - currentStock),
      purchasePrice,
      supplierName: p.supplier?.name ?? null,
      supplierPhone: p.supplier?.phone ?? null,
      supplierId: p.supplier?.id ?? null,
      unit: p.unit,
    })
  }

  // Sort: out of stock first, then lowest stock
  reorderItems.sort((a, b) => a.currentStock - b.currentStock)

  // Group by supplier for ordering convenience
  const bySupplier = new Map<string, ReorderItem[]>()
  for (const item of reorderItems) {
    const key = item.supplierName ?? "No Supplier"
    if (!bySupplier.has(key)) bySupplier.set(key, [])
    bySupplier.get(key)!.push(item)
  }

  const outOfStock = reorderItems.filter((i) => i.currentStock === 0)
  const lowStock = reorderItems.filter((i) => i.currentStock > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reorder Sheet</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Products at or below reorder level — {reorderItems.length} item{reorderItems.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 transition-colors print:hidden"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      {reorderItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-green-500" />
          </div>
          <p className="font-medium text-slate-600 text-lg">All products are well-stocked</p>
          <p className="text-sm text-slate-400 mt-1">No products are at or below their reorder level</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-medium text-red-600 opacity-80">Out of Stock</p>
              <p className="text-xl font-bold text-red-700 mt-1">{outOfStock.length} products</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-medium text-amber-600 opacity-80">Low Stock</p>
              <p className="text-xl font-bold text-amber-700 mt-1">{lowStock.length} products</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-600 opacity-80">Suppliers to Contact</p>
              <p className="text-xl font-bold text-slate-700 mt-1">{bySupplier.size}</p>
            </div>
          </div>

          {/* Grouped by supplier — useful for ordering */}
          {Array.from(bySupplier.entries()).map(([supplierName, items]) => {
            const supplierPhone = items[0]?.supplierPhone
            const supplierId = items[0]?.supplierId
            return (
              <div key={supplierName} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {/* Supplier header */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <div>
                    {supplierId ? (
                      <Link href={`/suppliers/${supplierId}`} className="font-semibold text-blue-600 hover:text-blue-700">
                        {supplierName}
                      </Link>
                    ) : (
                      <p className="font-semibold text-slate-700">{supplierName}</p>
                    )}
                    {supplierPhone && (
                      <p className="text-xs text-slate-500 mt-0.5">{supplierPhone}</p>
                    )}
                  </div>
                  <span className="text-xs font-medium text-slate-500 bg-slate-200 px-2 py-1 rounded-full">
                    {items.length} item{items.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-2 font-medium text-slate-500 text-xs">Product</th>
                      <th className="text-left px-5 py-2 font-medium text-slate-500 text-xs">Category</th>
                      <th className="text-right px-5 py-2 font-medium text-slate-500 text-xs">In Stock</th>
                      <th className="text-right px-5 py-2 font-medium text-slate-500 text-xs">Reorder Level</th>
                      <th className="text-right px-5 py-2 font-medium text-slate-500 text-xs">Needed</th>
                      <th className="text-right px-5 py-2 font-medium text-slate-500 text-xs">Purchase Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((item) => (
                      <tr key={item.id} className={`transition-colors ${
                        item.currentStock === 0 ? "bg-red-50/60" : "hover:bg-slate-50"
                      }`}>
                        <td className="px-5 py-3">
                          <Link href={`/inventory/${item.id}`} className="font-medium text-slate-800 hover:text-blue-600">
                            {item.name}
                          </Link>
                          {item.currentStock === 0 && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                              OUT
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs">{item.category ?? "—"}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-semibold ${item.currentStock === 0 ? "text-red-600" : "text-amber-600"}`}>
                            {item.currentStock} {item.unit.toLowerCase()}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-slate-500">
                          {item.reorderLevel} {item.unit.toLowerCase()}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-900">
                          {item.deficit > 0 ? `+${item.deficit}` : "0"}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {formatCurrency(item.purchasePrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 print:hidden">
        Products are grouped by supplier for easy ordering. Set a reorder level on each product in Inventory settings.
      </p>
    </div>
  )
}

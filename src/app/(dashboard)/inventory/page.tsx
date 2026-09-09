import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Search, Package, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ExportButtons } from "@/components/reports/export-buttons"
import { formatCurrency } from "@/lib/utils"
import { Pagination } from "@/components/ui/pagination"

export const metadata = { title: "Inventory" }

const PAGE_SIZE = 50

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { q, page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? "1") || 1)

  const where = {
    companyId,
    isActive: true,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  }

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        batches: { select: { quantity: true, expiryDate: true } },
      },
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.product.count({ where }),
  ])

  const pageAmount = products.reduce((s, p) => s + p.batches.reduce((bs, b) => bs + b.quantity, 0) * Number(p.salePrice), 0)
  const pageStock = products.reduce((s, p) => s + p.batches.reduce((bs, b) => bs + b.quantity, 0), 0)
  const isPartialPage = total > PAGE_SIZE

  return (
    <div className="space-y-6 print-wide-report">
      {/* This report has enough columns to want the extra width — print it
          landscape so the whole list fits one page width instead of tiling
          across pages, matching the server-generated PDF's orientation. */}
      <style>{"@media print { @page { size: A4 landscape; margin: 8mm; } }"}</style>
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} product{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons endpoint="/api/reports/inventory/export" params={{ q }} />
          <a
            href={`/api/reports/inventory/export?${new URLSearchParams({ ...(q ? { q } : {}), format: "pdf" }).toString()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-700"
          >
            <Printer className="h-4 w-4" />
            Print
          </a>
          <Link href="/inventory/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Product
            </Button>
          </Link>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-lg font-bold text-slate-900">Inventory</h1>
        <p className="text-xs text-slate-600">{total} product{total !== 1 ? "s" : ""}</p>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 items-center print:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search products…"
            className="pl-9 h-9 w-64 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        {q && (
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
            {q ? "Try a different filter" : "Add your first product to get started"}
          </p>
          {!q && (
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
                <th className="text-right px-4 py-3 font-medium text-slate-600">Stock</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Sale Price</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((product) => {
                const totalStock = product.batches.reduce((s, b) => s + b.quantity, 0)
                const isLow = totalStock <= product.reorderLevel
                const amount = totalStock * Number(product.salePrice)
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
                    <td className="px-4 py-3 text-right">
                      <span className={isLow ? "font-bold text-red-600" : "font-semibold text-slate-900"}>
                        {totalStock}
                      </span>
                      <span className="text-slate-400 text-xs ml-1">{product.unit.toLowerCase()}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatCurrency(product.salePrice.toString())}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(amount)}
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
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-right text-slate-700">
                  {isPartialPage ? "Total (this page)" : "Total"}
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">{pageStock.toLocaleString()}</td>
                <td />
                <td className="px-4 py-3 text-right font-bold font-mono text-slate-900">
                  {formatCurrency(pageAmount)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          <div className="print:hidden">
            <Pagination
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              baseUrl={`/inventory${new URLSearchParams({ ...(q ? { q } : {}) }).toString() ? `?${new URLSearchParams({ ...(q ? { q } : {}) }).toString()}` : ""}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

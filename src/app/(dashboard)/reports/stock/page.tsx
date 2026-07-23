import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReportExportButton } from "@/components/reports/report-export-button"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Stock Valuation" }

export default async function StockValuationPage({
  searchParams,
}: {
  searchParams: Promise<{ categoryId?: string; species?: string; zero?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { categoryId, species, zero } = await searchParams
  const showZero = zero === "1"

  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: {
        companyId,
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
        ...(species ? { species: species as any } : {}),
      },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      include: {
        category: { select: { name: true } },
        batches: {
          where: showZero ? {} : { quantity: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true,
            quantity: true,
            purchasePrice: true,
            salePrice: true,
          },
        },
      },
    }),
    db.category.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const SPECIES_LABELS: Record<string, string> = {
    BROILER: "Broiler", LAYER: "Layer", CATTLE: "Cattle",
    SHEEP: "Sheep", GOAT: "Goat", FISH: "Fish", GENERAL: "General",
  }
  const speciesValues = Object.keys(SPECIES_LABELS)

  // Compute valuation per product
  const rows = products
    .map((p) => {
      const totalQty = p.batches.reduce((s, b) => s + b.quantity, 0)
      const purchaseValue = p.batches.reduce(
        (s, b) => s + b.quantity * parseFloat(b.purchasePrice.toString()),
        0
      )
      const saleValue = p.batches.reduce(
        (s, b) => s + b.quantity * parseFloat(b.salePrice.toString()),
        0
      )
      return { product: p, totalQty, purchaseValue, saleValue }
    })
    .filter((r) => showZero || r.totalQty > 0)

  const grandPurchaseValue = rows.reduce((s, r) => s + r.purchaseValue, 0)
  const grandSaleValue = rows.reduce((s, r) => s + r.saleValue, 0)
  const grandQty = rows.reduce((s, r) => s + r.totalQty, 0)

  return (
    <div className="space-y-6 max-w-5xl">

      <div className="flex justify-end">
        <ReportExportButton report="stock" />
      </div>

      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stock Valuation</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {rows.length} product{rows.length !== 1 ? "s" : ""} · {grandQty} units in stock
          </p>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3">
        <select
          name="categoryId"
          defaultValue={categoryId ?? ""}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          name="species"
          defaultValue={species ?? ""}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All species</option>
          {speciesValues.map((v) => (
            <option key={v} value={v}>{SPECIES_LABELS[v]}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" name="zero" value="1" defaultChecked={showZero} />
          Include zero-stock
        </label>
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        {(categoryId || species || showZero) && (
          <Link href="/reports/stock">
            <Button variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Units</p>
          <p className="text-2xl font-bold text-slate-900">{grandQty.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-0.5">across {rows.length} products</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Purchase Value</p>
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(grandPurchaseValue)}</p>
          <p className="text-xs text-slate-400 mt-0.5">cost of stock on hand</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Sale Value</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(grandSaleValue)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            margin {formatCurrency(grandSaleValue - grandPurchaseValue)}
          </p>
        </div>
      </div>

      {/* Product table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No stock found for the selected filters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Product</th>
                <th className="text-left px-5 py-2.5 font-medium text-slate-600">Category</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Qty</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Purchase Value</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Sale Value</th>
                <th className="text-right px-5 py-2.5 font-medium text-slate-600">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ product, totalQty, purchaseValue, saleValue }) => (
                <>
                  <tr key={product.id} className="hover:bg-slate-50 bg-white">
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/inventory/${product.id}`}
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        {product.name}
                      </Link>
                      {product.genericName && (
                        <p className="text-xs text-slate-400">{product.genericName}</p>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs">{product.category?.name ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-slate-900">
                      {totalQty.toLocaleString()}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-blue-700">
                      {formatCurrency(purchaseValue)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-green-700">
                      {formatCurrency(saleValue)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-slate-600">
                      {formatCurrency(saleValue - purchaseValue)}
                    </td>
                  </tr>
                  {product.batches.map((batch) => (
                    <tr key={batch.id} className="bg-slate-50/50 text-xs">
                      <td className="px-5 py-1.5 pl-10 text-slate-500">
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                          {batch.batchNumber}
                        </span>
                      </td>
                      <td className="px-5 py-1.5 text-slate-400">
                        Exp: {formatDate(batch.expiryDate)}
                      </td>
                      <td className="px-5 py-1.5 text-right text-slate-600">{batch.quantity}</td>
                      <td className="px-5 py-1.5 text-right font-mono text-slate-500">
                        {formatCurrency(batch.quantity * parseFloat(batch.purchasePrice.toString()))}
                      </td>
                      <td className="px-5 py-1.5 text-right font-mono text-slate-500">
                        {formatCurrency(batch.quantity * parseFloat(batch.salePrice.toString()))}
                      </td>
                      <td />
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={2} className="px-5 py-2.5 text-sm font-semibold text-right text-slate-700">
                  Totals
                </td>
                <td className="px-5 py-2.5 text-right font-bold text-slate-900">
                  {grandQty.toLocaleString()}
                </td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-blue-700">
                  {formatCurrency(grandPurchaseValue)}
                </td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-green-700">
                  {formatCurrency(grandSaleValue)}
                </td>
                <td className="px-5 py-2.5 text-right font-bold font-mono text-slate-700">
                  {formatCurrency(grandSaleValue - grandPurchaseValue)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

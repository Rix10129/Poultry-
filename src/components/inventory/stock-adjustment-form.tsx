"use client"

import { useActionState, useState } from "react"
import { createStockAdjustment } from "@/app/(dashboard)/inventory/adjustments/actions"
import { Button } from "@/components/ui/button"

type Batch = { id: string; batchNumber: string; quantity: number; expiryDate: Date }
type Product = { id: string; name: string; unit: string; batches: Batch[] }

export function StockAdjustmentForm({ products }: { products: Product[] }) {
  const [state, formAction, pending] = useActionState(createStockAdjustment, null)
  const [selectedProductId, setSelectedProductId] = useState("")

  const selectedProduct = products.find((p) => p.id === selectedProductId)

  return (
    <form action={formAction} className="space-y-5">
      {state && "error" in state && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Product <span className="text-red-500">*</span>
        </label>
        <select
          name="productId"
          required
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
          className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {selectedProduct && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Batch <span className="text-red-500">*</span>
          </label>
          <select
            name="batchId"
            required
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select batch…</option>
            {selectedProduct.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batchNumber} — {b.quantity} {selectedProduct.unit.toLowerCase()} in stock
                {" "}(Exp: {new Date(b.expiryDate).toLocaleDateString("en-GB")})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Adjustment Type <span className="text-red-500">*</span>
          </label>
          <select
            name="direction"
            required
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="subtract">Remove from stock (damage / write-off)</option>
            <option value="add">Add to stock (count correction)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Quantity <span className="text-red-500">*</span>
          </label>
          <input
            name="quantity"
            type="number"
            min={1}
            required
            placeholder="0"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Reason / Notes</label>
        <input
          name="notes"
          placeholder="e.g. Expired stock destroyed, physical count correction…"
          className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="pt-1">
        <Button type="submit" disabled={pending || !selectedProductId}>
          {pending ? "Saving…" : "Save Adjustment"}
        </Button>
      </div>
    </form>
  )
}

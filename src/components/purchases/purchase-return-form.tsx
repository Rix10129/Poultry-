"use client"

import { useState, useMemo } from "react"
import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { ExpiryBadge } from "@/components/inventory/expiry-badge"
import { createPurchaseReturn } from "@/app/(dashboard)/purchases/actions"
import { formatCurrency } from "@/lib/utils"
import { Plus, Trash2, AlertCircle } from "lucide-react"

type BatchOption = {
  id: string
  batchNumber: string
  expiryDate: string
  quantity: number
  purchasePrice: string
}

export type ReturnProductOption = {
  id: string
  name: string
  unit: string
  batches: BatchOption[]
}

export type SupplierOption = {
  id: string
  name: string
}

type ReturnLine = {
  key: string
  productId: string
  productName: string
  unit: string
  batchId: string
  batchNumber: string
  expiryDate: string
  maxQty: number
  quantity: number
  purchasePrice: number
}

interface Props {
  products: ReturnProductOption[]
  suppliers: SupplierOption[]
  defaultSupplierId?: string
}

export function PurchaseReturnForm({ products, suppliers, defaultSupplierId }: Props) {
  const [state, formAction, pending] = useActionState(createPurchaseReturn, null)
  const [lines, setLines] = useState<ReturnLine[]>([])
  const [addProductId, setAddProductId] = useState("")
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "")
  const [purchaseRef, setPurchaseRef] = useState("")
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === addProductId),
    [products, addProductId]
  )

  const availableBatches = useMemo(
    () => selectedProduct?.batches.filter((b) => b.quantity > 0) ?? [],
    [selectedProduct]
  )

  function addLine(batchId: string) {
    if (!selectedProduct) return
    const batch = selectedProduct.batches.find((b) => b.id === batchId)
    if (!batch || batch.quantity === 0) return
    if (lines.some((l) => l.batchId === batchId)) return

    setLines((prev) => [
      ...prev,
      {
        key: `${batchId}-${Date.now()}`,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        unit: selectedProduct.unit,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        maxQty: batch.quantity,
        quantity: 1,
        purchasePrice: parseFloat(batch.purchasePrice),
      },
    ])
    setAddProductId("")
  }

  function updateLine(key: string, field: "quantity" | "purchasePrice", value: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        if (field === "quantity") return { ...l, quantity: Math.min(l.maxQty, Math.max(1, value)) }
        return { ...l, [field]: value }
      })
    )
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.purchasePrice, 0)

  const linesJson = JSON.stringify(
    lines.map((l) => ({
      productId: l.productId,
      batchId: l.batchId,
      quantity: l.quantity,
      purchasePrice: l.purchasePrice,
    }))
  )

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="linesJson" value={linesJson} />
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="purchaseOrderId" value={purchaseRef} />

      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {state.error}
        </div>
      )}

      {/* Header fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="supplier">Supplier *</Label>
          <Select
            id="supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            required
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="returnDate">Return Date</Label>
          <Input
            id="returnDate"
            name="returnDate"
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="purchaseRef">PO Reference (optional)</Label>
          <Input
            id="purchaseRef"
            placeholder="e.g. PO-2026-00001"
            value={purchaseRef}
            onChange={(e) => setPurchaseRef(e.target.value)}
          />
        </div>
      </div>

      {/* Add product row */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
        <p className="text-sm font-medium text-slate-700">Add Items to Return</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5 flex-1 min-w-48">
            <Label>Product</Label>
            <Select value={addProductId} onChange={(e) => setAddProductId(e.target.value)}>
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>

          {selectedProduct && availableBatches.length > 0 && (
            <div className="space-y-1.5 flex-1 min-w-48">
              <Label>Batch (in stock)</Label>
              <Select onChange={(e) => e.target.value && addLine(e.target.value)} defaultValue="">
                <option value="">Select batch…</option>
                {availableBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchNumber} — {b.quantity} in stock
                  </option>
                ))}
              </Select>
            </div>
          )}

          {selectedProduct && availableBatches.length === 0 && (
            <p className="text-sm text-amber-600 self-end pb-1">No stock available for this product</p>
          )}
        </div>
      </div>

      {/* Lines table */}
      {lines.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600">Product / Batch</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Qty (max)</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Purchase Price</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Total</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line) => (
                <tr key={line.key} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{line.productName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {line.batchNumber}
                      </span>
                      <ExpiryBadge expiryDate={line.expiryDate} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Input
                      type="number"
                      min={1}
                      max={line.maxQty}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, "quantity", parseInt(e.target.value) || 1)}
                      className="w-20 ml-auto text-right"
                    />
                    <p className="text-[11px] text-slate-400 text-right mt-0.5">max {line.maxQty}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.purchasePrice}
                      onChange={(e) => updateLine(line.key, "purchasePrice", parseFloat(e.target.value) || 0)}
                      className="w-28 ml-auto text-right"
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(line.quantity * line.purchasePrice)}
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => removeLine(line.key)} className="text-slate-400 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-200 px-4 py-3 flex justify-end">
            <div className="flex items-center gap-4 font-semibold text-slate-900">
              <span className="text-sm text-slate-500">Total Return Amount</span>
              <span className="text-lg">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input
          id="notes"
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reason for return…"
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={lines.length === 0 || !supplierId || pending} loading={pending}>
          <Plus className="h-4 w-4" />
          Create Purchase Return
        </Button>
      </div>
    </form>
  )
}

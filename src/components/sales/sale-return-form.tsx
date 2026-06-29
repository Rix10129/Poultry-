"use client"

import { useState, useMemo } from "react"
import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { ExpiryBadge } from "@/components/inventory/expiry-badge"
import { createSaleReturn } from "@/app/(dashboard)/sales/actions"
import { formatCurrency } from "@/lib/utils"
import { Plus, Trash2, AlertCircle } from "lucide-react"

type BatchOption = {
  id: string
  batchNumber: string
  expiryDate: string
  currentQty: number
  soldQty: number
  salePrice: string
}

export type ReturnProductOption = {
  id: string
  name: string
  unit: string
  batches: BatchOption[]
}

export type CustomerOption = {
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
  quantity: number
  salePrice: number
}

interface Props {
  products: ReturnProductOption[]
  customers: CustomerOption[]
  defaultInvoiceId?: string
  defaultCustomerId?: string
}

export function SaleReturnForm({ products, customers, defaultInvoiceId, defaultCustomerId }: Props) {
  const [state, formAction, pending] = useActionState(createSaleReturn, null)
  const [lines, setLines] = useState<ReturnLine[]>([])
  const [addProductId, setAddProductId] = useState("")
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "")
  const [invoiceRef, setInvoiceRef] = useState(defaultInvoiceId ?? "")
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === addProductId),
    [products, addProductId]
  )

  function addLine(batchId: string) {
    if (!selectedProduct) return
    const batch = selectedProduct.batches.find((b) => b.id === batchId)
    if (!batch) return
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
        quantity: 1,
        salePrice: parseFloat(batch.salePrice),
      },
    ])
    setAddProductId("")
  }

  function updateLine(key: string, field: "quantity" | "salePrice", value: number) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)))
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.salePrice, 0)

  const linesJson = JSON.stringify(
    lines.map((l) => ({
      productId: l.productId,
      batchId: l.batchId,
      quantity: l.quantity,
      salePrice: l.salePrice,
    }))
  )

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="linesJson" value={linesJson} />
      <input type="hidden" name="invoiceId" value={invoiceRef} />

      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {state.error}
        </div>
      )}

      {/* Header fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="customerId">Customer</Label>
          <Select
            id="customerId"
            name="customerId"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Walk-in / No Customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
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
          <Label htmlFor="invoiceRef">Invoice Reference (optional)</Label>
          <Input
            id="invoiceRef"
            placeholder="e.g. INV-2026-00001"
            value={invoiceRef}
            onChange={(e) => setInvoiceRef(e.target.value)}
          />
        </div>
      </div>

      {/* Add product row */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
        <p className="text-sm font-medium text-slate-700">Add Items to Return</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5 flex-1 min-w-48">
            <Label>Product</Label>
            <Select
              value={addProductId}
              onChange={(e) => setAddProductId(e.target.value)}
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>

          {selectedProduct && (
            <div className="space-y-1.5 flex-1 min-w-48">
              <Label>Batch</Label>
              <Select onChange={(e) => e.target.value && addLine(e.target.value)} defaultValue="">
                <option value="">Select batch…</option>
                {selectedProduct.batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchNumber} — sold: {b.soldQty}
                  </option>
                ))}
              </Select>
            </div>
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
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Qty</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Price</th>
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
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 ml-auto text-right"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.salePrice}
                      onChange={(e) => updateLine(line.key, "salePrice", parseFloat(e.target.value) || 0)}
                      className="w-28 ml-auto text-right"
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(line.quantity * line.salePrice)}
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
        <Button type="submit" disabled={lines.length === 0 || pending} loading={pending}>
          <Plus className="h-4 w-4" />
          Create Sale Return
        </Button>
      </div>
    </form>
  )
}

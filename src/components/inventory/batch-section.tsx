"use client"

import { useState, useActionState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ExpiryBadge } from "./expiry-badge"
import { createBatch } from "@/app/(dashboard)/inventory/actions"
import { formatDate, formatCurrency } from "@/lib/utils"
import { Plus, Package2 } from "lucide-react"

type BatchRow = {
  id: string
  batchNumber: string
  manufactureDate: Date | null
  expiryDate: Date
  purchasePrice: string
  salePrice: string
  quantity: number
  initialQuantity: number
}

interface BatchSectionProps {
  productId: string
  batches: BatchRow[]
}

export function BatchSection({ productId, batches }: BatchSectionProps) {
  const [showForm, setShowForm] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const action = createBatch.bind(null, productId)
  const [state, formAction, pending] = useActionState(action, null)

  useEffect(() => {
    if (state === null && formKey > 0) {
      setShowForm(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function handleSubmitSuccess() {
    setFormKey((k) => k + 1)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">
          Stock Batches
          <span className="ml-2 text-sm font-normal text-slate-400">({batches.length})</span>
        </h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          Add Batch
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <h4 className="font-medium text-slate-900 mb-4 text-sm">Receive New Batch</h4>
          <form key={formKey} action={formAction} onSubmit={handleSubmitSuccess} className="space-y-3">
            {state?.error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {state.error}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="batchNumber">Batch # *</Label>
                <Input id="batchNumber" name="batchNumber" required placeholder="e.g. B2025-001" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manufactureDate">Mfg Date</Label>
                <Input id="manufactureDate" name="manufactureDate" type="date" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expiryDate">Expiry Date *</Label>
                <Input id="expiryDate" name="expiryDate" type="date" required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="purchasePrice">Purchase Price *</Label>
                <Input id="purchasePrice" name="purchasePrice" type="number" min="0.01" step="0.01" required placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="salePrice">Sale Price *</Label>
                <Input id="salePrice" name="salePrice" type="number" min="0.01" step="0.01" required placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input id="quantity" name="quantity" type="number" min="1" step="1" required placeholder="0" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={pending}>Add Batch</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {batches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center">
          <Package2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">No stock batches yet</p>
          <p className="text-xs text-slate-400 mt-1">Add a batch to start tracking stock</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600">Batch #</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600">Mfg Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600">Expiry</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Purchase</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Sale</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Stock</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">Initial</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((batch) => (
                <tr key={batch.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-800">{batch.batchNumber}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDate(batch.manufactureDate)}</td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs">{formatDate(batch.expiryDate)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{formatCurrency(batch.purchasePrice)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{formatCurrency(batch.salePrice)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{batch.quantity}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{batch.initialQuantity}</td>
                  <td className="px-4 py-2.5"><ExpiryBadge expiryDate={batch.expiryDate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

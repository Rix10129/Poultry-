"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createPurchase } from "@/app/(dashboard)/purchases/actions"
import { formatCurrency } from "@/lib/utils"
import { Plus, Trash2, AlertCircle } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductOption = {
  id: string
  name: string
  unit: string
  taxRate: string
  purchasePrice: string
  salePrice: string
}

export type SupplierOption = {
  id: string
  name: string
}

type LineItem = {
  key: string
  productId: string
  productName: string
  unit: string
  batchNumber: string
  expiryDate: string
  manufactureDate: string
  quantity: number
  purchasePrice: number
  salePrice: number
  discount: number
  taxRate: number
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PurchaseFormProps {
  products: ProductOption[]
  suppliers: SupplierOption[]
  defaultSupplierId?: string
}

export function PurchaseForm({ products, suppliers, defaultSupplierId = "" }: PurchaseFormProps) {
  const [lines, setLines] = useState<LineItem[]>([])
  const [addProductId, setAddProductId] = useState("")
  const [supplierId, setSupplierId] = useState(defaultSupplierId)
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split("T")[0])
  const [paidAmount, setPaidAmount] = useState("")
  const [discountAmount, setDiscountAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const disc = parseFloat(discountAmount) || 0
  const paid = parseFloat(paidAmount) || 0

  const { subtotal, taxTotal, net } = useMemo(() => {
    const subtotal = lines.reduce(
      (s, l) => s + l.quantity * l.purchasePrice * (1 - l.discount / 100),
      0
    )
    const taxTotal = lines.reduce((s, l) => {
      const base = l.quantity * l.purchasePrice * (1 - l.discount / 100)
      return s + base * l.taxRate / 100
    }, 0)
    return { subtotal, taxTotal, net: Math.max(0, subtotal - disc + taxTotal) }
  }, [lines, disc])

  const balance = net - paid

  function addLine() {
    if (!addProductId) return
    const product = products.find((p) => p.id === addProductId)
    if (!product) return

    const line: LineItem = {
      key: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      batchNumber: "",
      expiryDate: "",
      manufactureDate: "",
      quantity: 1,
      purchasePrice: parseFloat(product.purchasePrice) || 0,
      salePrice: parseFloat(product.salePrice) || 0,
      discount: 0,
      taxRate: parseFloat(product.taxRate) || 0,
    }

    setLines((prev) => [...prev, line])
    setAddProductId("")
    setError(null)
  }

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { setError("Please select a supplier"); return }
    if (lines.length === 0) { setError("Add at least one product"); return }

    for (const line of lines) {
      if (!line.batchNumber.trim()) {
        setError(`Batch number required for "${line.productName}"`); return
      }
      if (!line.expiryDate) {
        setError(`Expiry date required for "${line.productName}"`); return
      }
      if (line.quantity < 1) {
        setError(`Invalid quantity for "${line.productName}"`); return
      }
    }

    setSubmitting(true)
    setError(null)

    const fd = new FormData()
    fd.set("supplierId", supplierId)
    fd.set("orderDate", orderDate)
    fd.set("paidAmount", String(paid))
    fd.set("discountAmount", String(disc))
    fd.set("notes", notes)
    fd.set(
      "linesJson",
      JSON.stringify(
        lines.map((l) => ({
          productId: l.productId,
          batchNumber: l.batchNumber,
          expiryDate: l.expiryDate,
          manufactureDate: l.manufactureDate || null,
          quantity: l.quantity,
          purchasePrice: l.purchasePrice,
          salePrice: l.salePrice,
          discount: l.discount,
          taxRate: l.taxRate,
        }))
      )
    )

    try {
      const result = await createPurchase(null, fd)
      if (result?.error) {
        setError(result.error)
        setSubmitting(false)
      }
    } catch {
      setError("Unexpected error — please try again")
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-1.5">
          <Label>Supplier *</Label>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Order Date</Label>
          <Input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Items
            {lines.length > 0 && (
              <span className="ml-2 text-slate-400 font-normal">({lines.length})</span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <Select
              value={addProductId}
              onChange={(e) => setAddProductId(e.target.value)}
              className="w-56 text-sm"
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button type="button" size="sm" onClick={addLine} disabled={!addProductId}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
            <p className="text-sm text-slate-400">Select a product above and click Add</p>
            <p className="text-xs text-slate-300 mt-1">Each line creates a new stock batch</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">Product</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600 w-32">Batch #</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600 w-32">Mfg Date</th>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600 w-32">Expiry *</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-20">Qty</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-28">Buy Price</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-28">Sale Price</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-18">Disc%</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => {
                  const lineTotal =
                    line.quantity * line.purchasePrice * (1 - line.discount / 100)
                  return (
                    <tr key={line.key} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{line.productName}</p>
                        <p className="text-xs text-slate-400">{line.unit}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          value={line.batchNumber}
                          onChange={(e) => updateLine(line.key, { batchNumber: e.target.value })}
                          placeholder="BATCH-001"
                          className={`text-xs ${!line.batchNumber ? "border-amber-300 focus:ring-amber-400" : ""}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="date"
                          value={line.manufactureDate}
                          onChange={(e) => updateLine(line.key, { manufactureDate: e.target.value })}
                          className="text-xs"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="date"
                          value={line.expiryDate}
                          onChange={(e) => updateLine(line.key, { expiryDate: e.target.value })}
                          required
                          className={`text-xs ${!line.expiryDate ? "border-amber-300 focus:ring-amber-400" : ""}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.key, {
                              quantity: Math.max(1, parseInt(e.target.value) || 1),
                            })
                          }
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.purchasePrice}
                          onChange={(e) =>
                            updateLine(line.key, { purchasePrice: parseFloat(e.target.value) || 0 })
                          }
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.salePrice}
                          onChange={(e) =>
                            updateLine(line.key, { salePrice: parseFloat(e.target.value) || 0 })
                          }
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={line.discount}
                          onChange={(e) =>
                            updateLine(line.key, { discount: parseFloat(e.target.value) || 0 })
                          }
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                        {formatCurrency(lineTotal)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            setLines((prev) => prev.filter((l) => l.key !== line.key))
                          }
                          className="text-slate-300 hover:text-red-500 transition-colors p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment + summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Payment</h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Amount Paid</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
            <SumRow label="Subtotal" value={formatCurrency(subtotal)} />
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Order Discount</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="0.00"
                className="w-28 text-right h-7 text-sm py-1"
              />
            </div>
            {taxTotal > 0.001 && <SumRow label="Tax" value={formatCurrency(taxTotal)} />}
            <div className="border-t border-slate-200 pt-2">
              <SumRow label="Net Amount" value={formatCurrency(net)} bold />
            </div>
            <SumRow label="Paid" value={formatCurrency(paid)} />
            <div
              className={`flex justify-between font-bold ${
                balance > 0.001
                  ? "text-red-600"
                  : balance < -0.001
                  ? "text-green-600"
                  : "text-slate-900"
              }`}
            >
              <span>
                {balance > 0.001 ? "Balance Due" : balance < -0.001 ? "Change" : "Settled ✓"}
              </span>
              <span>{Math.abs(balance) < 0.001 ? "—" : formatCurrency(Math.abs(balance))}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={submitting} disabled={lines.length === 0 || submitting}>
          Receive Purchase
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

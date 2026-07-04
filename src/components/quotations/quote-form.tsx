"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createQuotation } from "@/app/(dashboard)/quotations/actions"
import { formatCurrency } from "@/lib/utils"
import { Plus, Trash2, AlertCircle } from "lucide-react"

type ProductOption = {
  id: string
  name: string
  unit: string
  taxRate: string
  salePrice: string
}

type CustomerOption = {
  id: string
  name: string
}

interface QuoteFormProps {
  products: ProductOption[]
  customers: CustomerOption[]
}

type LineItem = {
  key: string
  productId: string
  productName: string
  unit: string
  quantity: number
  salePrice: number
  discount: number
  taxRate: number
}

export function QuoteForm({ products, customers }: QuoteFormProps) {
  const [lines, setLines] = useState<LineItem[]>([])
  const [addProductId, setAddProductId] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [quoteDate, setQuoteDate] = useState(() => new Date().toISOString().split("T")[0])
  const [validUntil, setValidUntil] = useState("")
  const [discountAmount, setDiscountAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function addLine() {
    if (!addProductId) return
    const product = products.find((p) => p.id === addProductId)
    if (!product) return
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        quantity: 1,
        salePrice: parseFloat(product.salePrice) || 0,
        discount: 0,
        taxRate: parseFloat(product.taxRate) || 0,
      },
    ])
    setAddProductId("")
    setError(null)
  }

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  const disc = parseFloat(discountAmount) || 0

  const { subtotal, taxTotal, net } = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.quantity * l.salePrice * (1 - l.discount / 100), 0)
    const taxTotal = lines.reduce((s, l) => {
      const base = l.quantity * l.salePrice * (1 - l.discount / 100)
      return s + (base * l.taxRate) / 100
    }, 0)
    return { subtotal, taxTotal, net: Math.max(0, subtotal - disc + taxTotal) }
  }, [lines, disc])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (lines.length === 0) { setError("Add at least one product"); return }
    setSubmitting(true)
    setError(null)

    const fd = new FormData()
    fd.set("customerId", customerId)
    fd.set("quoteDate", quoteDate)
    fd.set("validUntil", validUntil)
    fd.set("discountAmount", String(disc))
    fd.set("notes", notes)
    fd.set(
      "linesJson",
      JSON.stringify(
        lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unit: l.unit,
          salePrice: l.salePrice,
          discount: l.discount,
          taxRate: l.taxRate,
        }))
      )
    )

    try {
      const result = await createQuotation(null, fd)
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label>Customer</Label>
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in / General</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Quote Date</Label>
          <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Valid Until</Label>
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Items {lines.length > 0 && <span className="text-slate-400 font-normal">({lines.length})</span>}</h3>
          <div className="flex items-center gap-2">
            <Select value={addProductId} onChange={(e) => setAddProductId(e.target.value)} className="w-56 text-sm">
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button type="button" size="sm" onClick={addLine} disabled={!addProductId}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
            <p className="text-sm text-slate-400">Select a product and click Add</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">Product</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-24">Qty</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-32">Unit Price</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-20">Disc%</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => {
                  const lineTotal = line.quantity * line.salePrice * (1 - line.discount / 100)
                  return (
                    <tr key={line.key} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{line.productName}</p>
                        <p className="text-xs text-slate-400">{line.unit}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="number" min="1" value={line.quantity}
                          onChange={(e) => updateLine(line.key, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="number" min="0" step="0.01" value={line.salePrice}
                          onChange={(e) => updateLine(line.key, { salePrice: parseFloat(e.target.value) || 0 })}
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="number" min="0" max="100" step="0.01" value={line.discount}
                          onChange={(e) => updateLine(line.key, { discount: parseFloat(e.target.value) || 0 })}
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                        {formatCurrency(lineTotal)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))} className="text-slate-300 hover:text-red-500 p-1">
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

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Terms, conditions, delivery info…"
            rows={4}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Discount</span>
              <Input
                type="number" min="0" step="0.01" value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="0.00" className="w-28 text-right h-7 text-sm py-1"
              />
            </div>
            {taxTotal > 0.001 && (
              <div className="flex justify-between text-slate-600">
                <span>Tax</span><span>{formatCurrency(taxTotal)}</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2 flex justify-between font-semibold text-slate-900">
              <span>Net Total</span><span>{formatCurrency(net)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={submitting} disabled={lines.length === 0 || submitting}>
          Create Quotation
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
      </div>
    </form>
  )
}

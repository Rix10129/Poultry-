"use client"

import { useState, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { ExpiryBadge } from "@/components/inventory/expiry-badge"
import { createInvoice, updateInvoice } from "@/app/(dashboard)/sales/actions"
import { formatCurrency } from "@/lib/utils"
import { Plus, Trash2, AlertCircle, WifiOff, CheckCircle2, ChevronDown } from "lucide-react"
import { addToSalesQueue } from "@/lib/offline-db"

// ── Types ─────────────────────────────────────────────────────────────────────

type BatchOption = {
  id: string
  batchNumber: string
  expiryDate: string // ISO string
  quantity: number   // original DB qty
  salePrice: string  // serialized Decimal
}

export type ProductOption = {
  id: string
  name: string
  unit: string
  taxRate: string
  salePrice: string
  batches: BatchOption[] // sorted by expiryDate ASC from server
}

export type CustomerOption = {
  id: string
  name: string
  type: string
}

type LineItem = {
  key: string
  productId: string
  productName: string
  unit: string
  batchId: string
  batchNumber: string
  expiryDate: string
  maxQty: number     // available at time of adding (accounts for other lines)
  quantity: number
  salePrice: number
  discount: number   // percentage
  taxRate: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function batchAvailable(batchId: string, batchTotal: number, lines: LineItem[]): number {
  const used = lines.reduce((s, l) => l.batchId === batchId ? s + l.quantity : s, 0)
  return Math.max(0, batchTotal - used)
}

// ── Component ─────────────────────────────────────────────────────────────────

export type InitialInvoiceLine = {
  productId: string
  productName: string
  unit: string
  batchId: string
  batchNumber: string
  expiryDate: string
  quantity: number
  salePrice: string
  discount: string
  taxRate: string
}

export type InitialInvoice = {
  id: string
  customerId: string | null
  invoiceDate: string
  dueDate: string | null
  paymentMode: string
  paidAmount: string
  discountAmount: string
  notes: string | null
  lines: InitialInvoiceLine[]
  hasDependentRecords?: boolean
  canOverrideSafeguards?: boolean
}

interface InvoiceFormProps {
  products: ProductOption[]
  customers: CustomerOption[]
  mode?: "create" | "update"
  initialInvoice?: InitialInvoice
}

function initialLinesFromInvoice(initialInvoice: InitialInvoice | undefined, products: ProductOption[]): LineItem[] {
  return (initialInvoice?.lines ?? []).map((line) => ({
    key: crypto.randomUUID(),
    productId: line.productId,
    productName: line.productName,
    unit: line.unit,
    batchId: line.batchId,
    batchNumber: line.batchNumber,
    expiryDate: line.expiryDate,
    maxQty: products.flatMap((p) => p.batches).find((b) => b.id === line.batchId)?.quantity ?? line.quantity,
    quantity: line.quantity,
    salePrice: parseFloat(line.salePrice) || 0,
    discount: parseFloat(line.discount) || 0,
    taxRate: parseFloat(line.taxRate) || 0,
  }))
}

export function InvoiceForm({ products, customers, mode = "create", initialInvoice }: InvoiceFormProps) {
  const [lines, setLines] = useState<LineItem[]>(() => initialLinesFromInvoice(initialInvoice, products))
  const [addProductId, setAddProductId] = useState("")
  const [productDropdownOpen, setProductDropdownOpen] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const productDropdownRef = useRef<HTMLDivElement>(null)
  const productSearchRef = useRef<HTMLInputElement>(null)
  const [customerId, setCustomerId] = useState(initialInvoice?.customerId ?? "")
  const [invoiceDate, setInvoiceDate] = useState(() => initialInvoice?.invoiceDate ?? new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState(initialInvoice?.dueDate ?? "")
  const [paymentMode, setPaymentMode] = useState(initialInvoice?.paymentMode ?? "CASH")
  const [paidAmount, setPaidAmount] = useState(initialInvoice?.paidAmount ?? "")
  const [discountAmount, setDiscountAmount] = useState(initialInvoice?.discountAmount ?? "")
  const [notes, setNotes] = useState(initialInvoice?.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [savedOffline, setSavedOffline] = useState(false)
  const [confirmDependentEdit, setConfirmDependentEdit] = useState(false)

  // Products that still have some available stock (considering current lines)
  const availableProducts = useMemo(
    () => products.filter(p => p.batches.some(b => batchAvailable(b.id, b.quantity, lines) > 0)),
    [products, lines]
  )
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    if (!query) return availableProducts
    return availableProducts.filter((p) => p.name.toLowerCase().includes(query))
  }, [availableProducts, productSearch])
  const selectedAddProduct = availableProducts.find((p) => p.id === addProductId)

  function addLine() {
    if (!addProductId) return
    const product = products.find(p => p.id === addProductId)
    if (!product) return

    // FEFO: pick the first batch (sorted by expiryDate ASC) with available stock
    let chosen: { batch: BatchOption; avail: number } | null = null
    for (const batch of product.batches) {
      const avail = batchAvailable(batch.id, batch.quantity, lines)
      if (avail > 0) { chosen = { batch, avail }; break }
    }

    if (!chosen) {
      setError(`No available stock for "${product.name}"`)
      return
    }

    const line: LineItem = {
      key: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      batchId: chosen.batch.id,
      batchNumber: chosen.batch.batchNumber,
      expiryDate: chosen.batch.expiryDate,
      maxQty: chosen.avail,
      quantity: 1,
      salePrice: parseFloat(chosen.batch.salePrice) || parseFloat(product.salePrice) || 0,
      discount: 0,
      taxRate: parseFloat(product.taxRate) || 0,
    }

    setLines(prev => [...prev, line])
    setAddProductId("")
    setProductDropdownOpen(false)
    setProductSearch("")
    requestAnimationFrame(() => productSearchRef.current?.focus())
    setError(null)
  }

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  }

  // Computed totals
  const disc = parseFloat(discountAmount) || 0
  const paid = parseFloat(paidAmount) || 0

  const { subtotal, taxTotal, net } = useMemo(() => {
    const subtotal = lines.reduce(
      (s, l) => s + l.quantity * l.salePrice * (1 - l.discount / 100), 0
    )
    const taxTotal = lines.reduce((s, l) => {
      const base = l.quantity * l.salePrice * (1 - l.discount / 100)
      return s + base * l.taxRate / 100
    }, 0)
    return { subtotal, taxTotal, net: Math.max(0, subtotal - disc + taxTotal) }
  }, [lines, disc])

  const balance = net - paid

  function buildLinesJson() {
    return JSON.stringify(lines.map((l) => ({
      productId: l.productId,
      batchId: l.batchId,
      quantity: l.quantity,
      unit: l.unit,
      salePrice: l.salePrice,
      discount: l.discount,
      taxRate: l.taxRate,
    })))
  }

  async function saveOffline() {
    await addToSalesQueue({
      customerId,
      invoiceDate,
      dueDate,
      paymentMode,
      paidAmount: String(paid),
      discountAmount: String(disc),
      notes,
      linesJson: buildLinesJson(),
    })
    setSavedOffline(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (lines.length === 0) { setError("Add at least one product"); return }

    for (const line of lines) {
      if (!line.quantity || line.quantity < 1) {
        setError(`Invalid quantity for ${line.productName}`); return
      }
      if (line.quantity > line.maxQty) {
        setError(`Qty for ${line.productName} (batch ${line.batchNumber}) exceeds available ${line.maxQty}`)
        return
      }
    }

    setSubmitting(true)
    setError(null)

    // Invoice updates are accounting/stock mutations and must be handled online.
    if (mode === "update" && !navigator.onLine) {
      setError("Invoice editing requires an internet connection")
      setSubmitting(false)
      return
    }

    // If the browser already knows we're offline, skip the server call entirely
    if (mode === "create" && !navigator.onLine) {
      try {
        await saveOffline()
      } catch {
        setError("Could not save offline — please try again")
        setSubmitting(false)
      }
      return
    }

    // Try the server. Three outcomes:
    //   1. Server redirect (success) — Next.js navigates, execution ends
    //   2. Validation error returned — show it
    //   3. Network error (TypeError: Failed to fetch) — fall back to offline queue
    const fd = new FormData()
    fd.set("customerId", customerId)
    fd.set("invoiceDate", invoiceDate)
    fd.set("dueDate", dueDate)
    fd.set("paymentMode", paymentMode)
    fd.set("paidAmount", String(paid))
    fd.set("discountAmount", String(disc))
    fd.set("notes", notes)
    fd.set("linesJson", buildLinesJson())
    if (mode === "update" && initialInvoice) {
      fd.set("id", initialInvoice.id)
      if (confirmDependentEdit) fd.set("confirmDependentEdit", "1")
    }

    try {
      const result = mode === "update" ? await updateInvoice(null, fd) : await createInvoice(null, fd)
      if (result?.error) {
        setError(result.error)
        setSubmitting(false)
      }
      // On success redirect() is called server-side — Next.js navigates away
    } catch (err: unknown) {
      // Next.js redirect() throws a special error internally — re-throw it so the
      // router can handle the navigation (otherwise the catch swallows it and the
      // user sees "Unexpected error" even after a successful create).
      const redirectDigest = err instanceof Error && "digest" in err ? String(err.digest) : ""
      if (redirectDigest.startsWith("NEXT_REDIRECT")) throw err

      // True network failure: navigator.onLine can lie (device has WiFi but no
      // internet), so we check the error type and fall back to the offline queue.
      const isNetworkError =
        err instanceof TypeError ||
        (err instanceof Error && err.name === "TypeError") ||
        (err instanceof Error && err.message.toLowerCase().includes("fetch")) ||
        (err instanceof Error && err.message.toLowerCase().includes("network"))

      if (mode === "create" && isNetworkError) {
        try {
          await saveOffline()
        } catch {
          setError("No connection and could not save offline — please try again")
          setSubmitting(false)
        }
        return
      }

      setError("Unexpected error — please try again")
      setSubmitting(false)
    }
  }

  if (savedOffline) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
          <WifiOff className="h-7 w-7 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Invoice saved offline</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">
            Your invoice has been saved on this device. It will sync to the server automatically when your internet connection returns.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 px-4 py-2 rounded-lg">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          Saved — look for the sync indicator in the top bar when reconnected
        </div>
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            onClick={() => {
              setSavedOffline(false)
              setLines([])
              setCustomerId("")
              setInvoiceDate(new Date().toISOString().split("T")[0])
              setDueDate("")
              setPaymentMode("CASH")
              setPaidAmount("")
              setDiscountAmount("")
              setNotes("")
            }}
          >
            Create another
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {mode === "update" && initialInvoice?.hasDependentRecords && initialInvoice.canOverrideSafeguards && (
        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <input
            type="checkbox"
            checked={confirmDependentEdit}
            onChange={(e) => setConfirmDependentEdit(e.target.checked)}
            className="mt-1"
          />
          <span>
            I understand this invoice has dependent payments or returns and explicitly approve recalculating its stock and accounting values.
          </span>
        </label>
      )}

      {mode === "update" && initialInvoice?.hasDependentRecords && !initialInvoice.canOverrideSafeguards && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This invoice has dependent payments or returns. Only an Owner or Admin can explicitly confirm edits.
        </div>
      )}

      {/* Header row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label>Customer</Label>
          <Select value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Walk-in / Cash Sale</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Invoice Date</Label>
          <Input
            type="date"
            value={invoiceDate}
            onChange={e => setInvoiceDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Due Date</Label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
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
            <div
              ref={productDropdownRef}
              className="relative w-56"
              onBlur={(e) => {
                if (!productDropdownRef.current?.contains(e.relatedTarget as Node | null)) {
                  setProductDropdownOpen(false)
                }
              }}
            >
              <button
                type="button"
                className="flex h-9 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => {
                  setProductDropdownOpen((open) => {
                    const nextOpen = !open
                    if (nextOpen) requestAnimationFrame(() => productSearchRef.current?.focus())
                    return nextOpen
                  })
                }}
              >
                <span className={selectedAddProduct ? "truncate" : "truncate text-slate-400"}>
                  {selectedAddProduct?.name ?? "Select product…"}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${productDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {productDropdownOpen && (
                <div className="absolute right-0 z-20 mt-1 max-h-72 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
                  <div className="border-b border-slate-100 p-2">
                    <Input
                      ref={productSearchRef}
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Search products…"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="max-h-56 overflow-auto py-1">
                    {availableProducts.length === 0 ? (
                      <div className="px-3 py-2 text-slate-400">No products in stock</div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="px-3 py-2 text-slate-400">No matching products</div>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                          onClick={() => {
                            setAddProductId(p.id)
                            setProductSearch("")
                            setProductDropdownOpen(false)
                          }}
                        >
                          {p.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <Button type="button" size="sm" onClick={addLine} disabled={!addProductId}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
            <p className="text-sm text-slate-400">Select a product above and click Add</p>
            <p className="text-xs text-slate-300 mt-1">FEFO batch is auto-selected</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">Product / Batch</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">Avail</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-24">Qty</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-32">Unit Price</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-20">Disc%</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map(line => (
                  <LineRow
                    key={line.key}
                    line={line}
                    updateLine={updateLine}
                    removeLine={(key) => setLines(prev => prev.filter(l => l.key !== key))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment + summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Payment</h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <Select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CREDIT">Credit (on account)</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount Received</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
            <SumRow label="Subtotal" value={formatCurrency(subtotal)} />
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Invoice Discount</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={e => setDiscountAmount(e.target.value)}
                placeholder="0.00"
                className="w-28 text-right h-7 text-sm py-1"
              />
            </div>
            {taxTotal > 0.001 && <SumRow label="Tax" value={formatCurrency(taxTotal)} />}
            <div className="border-t border-slate-200 pt-2">
              <SumRow label="Net Amount" value={formatCurrency(net)} bold />
            </div>
            <SumRow label="Received" value={formatCurrency(paid)} />
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
                {balance > 0.001 ? "Balance Due" : balance < -0.001 ? "Change Due" : "Settled ✓"}
              </span>
              <span>{Math.abs(balance) < 0.001 ? "—" : formatCurrency(Math.abs(balance))}</span>
            </div>
          </div>
        </div>
      </div>


      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={submitting} disabled={lines.length === 0 || submitting || (mode === "update" && !!initialInvoice?.hasDependentRecords && (!initialInvoice.canOverrideSafeguards || !confirmDependentEdit))}>
          {mode === "update" ? "Update Invoice" : "Create Invoice"}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function LineRow({
  line,
  updateLine,
  removeLine,
}: {
  line: LineItem
  updateLine: (key: string, patch: Partial<LineItem>) => void
  removeLine: (key: string) => void
}) {
  const lineTotal = line.quantity * line.salePrice * (1 - line.discount / 100)
  const overQty = line.quantity > line.maxQty

  return (
    <tr className={overQty ? "bg-red-50" : "hover:bg-slate-50"}>
      <td className="px-3 py-2.5">
        <p className="font-medium text-slate-900">{line.productName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
            {line.batchNumber}
          </span>
          <ExpiryBadge expiryDate={line.expiryDate} />
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-slate-400">{line.maxQty}</td>
      <td className="px-3 py-2.5">
        <Input
          type="number"
          min="1"
          max={line.maxQty}
          value={line.quantity}
          onChange={e =>
            updateLine(line.key, { quantity: Math.max(1, parseInt(e.target.value) || 1) })
          }
          className={`text-right ${overQty ? "border-red-400 focus:ring-red-400" : ""}`}
        />
      </td>
      <td className="px-3 py-2.5">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.salePrice}
          onChange={e =>
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
          onChange={e =>
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
          onClick={() => removeLine(line.key)}
          className="text-slate-300 hover:text-red-500 transition-colors p-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
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

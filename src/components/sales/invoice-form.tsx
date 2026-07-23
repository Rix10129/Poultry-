"use client"

import { useState, useMemo } from "react"
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


type InvoiceFormInitialLine = {
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

type InvoiceFormInitialInvoice = {
  customerId?: string | null
  invoiceDate?: string
  dueDate?: string | null
  paymentMode?: string
  paidAmount?: string
  discountAmount?: string
  notes?: string | null
  lines?: InvoiceFormInitialLine[]
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


function initialLinesFromInvoice(initialInvoice: InvoiceFormInitialInvoice | undefined, products: ProductOption[]): LineItem[] {
  return (initialInvoice?.lines ?? []).map((line) => ({
    key: crypto.randomUUID(),
    productId: line.productId,
    productName: line.productName,
    unit: line.unit,
    batchId: line.batchId,
    batchNumber: line.batchNumber,
    expiryDate: line.expiryDate,
    maxQty: products.flatMap((p) => p.batches).find((batch) => batch.id === line.batchId)?.quantity ?? line.quantity,
    quantity: line.quantity,
    salePrice: parseFloat(line.salePrice) || 0,
    discount: parseFloat(line.discount) || 0,
    taxRate: parseFloat(line.taxRate) || 0,
  }))
}

function dateInputValue(value: string | null | undefined) {
  return value ? value.split("T")[0] : ""
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
  initialInvoice?: InvoiceFormInitialInvoice
}

export function InvoiceForm({ products, customers }: InvoiceFormProps) {
  const [lines, setLines] = useState<LineItem[]>([])
  const [addProductId, setAddProductId] = useState("")
  const [productSearch, setProductSearch] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState("")
  const [paymentMode, setPaymentMode] = useState("CASH")
  const [paidAmount, setPaidAmount] = useState("")
  const [discountAmount, setDiscountAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [savedOffline, setSavedOffline] = useState(false)
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false)
  const productSearchRef = useRef<HTMLInputElement>(null)

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

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    if (!query) return availableProducts
    return availableProducts.filter((product) => product.name.toLowerCase().includes(query))
  }, [availableProducts, productSearch])

  function addLine() {
    const matchedProduct = products.find(p => p.name.toLowerCase() === productSearch.trim().toLowerCase())
    const productId = addProductId || matchedProduct?.id || ""
    if (!productId) return
    const product = products.find(p => p.id === productId)
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
    setProductSearch("")
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
  const submitLabel = formMode === "update" ? "Update Invoice" : "Create Invoice"

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
    if (formMode === "update" && !navigator.onLine) {
      setError("Invoice editing requires an internet connection")
      setSubmitting(false)
      return
    }

    // If the browser already knows we're offline, skip the server call entirely
    if (formMode === "create" && !navigator.onLine) {
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
      const errorWithDigest = err as { digest?: string; name?: string; message?: string }
      if (errorWithDigest.digest?.startsWith("NEXT_REDIRECT")) throw err

      // True network failure: navigator.onLine can lie (device has WiFi but no
      // internet), so we check the error type and fall back to the offline queue.
      const isNetworkError =
        err instanceof TypeError ||
        errorWithDigest.name === "TypeError" ||
        errorWithDigest.message?.toLowerCase().includes("fetch") ||
        errorWithDigest.message?.toLowerCase().includes("network")

      if (formMode === "create" && isNetworkError) {
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
              setProductSearch("")
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
    <form onSubmit={handleSubmit} className="space-y-4 pb-36 md:pb-28">
      {error && (
        <div className="sticky top-2 z-30 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 shadow-sm">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Invoice details */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(11rem,1fr)_minmax(13rem,1fr)_auto] gap-2 w-full md:w-auto">
            <Input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search product…"
              aria-label="Search products"
            />
            <Select
              value={addProductId}
              onChange={e => setAddProductId(e.target.value)}
              className="text-sm"
            >
              <option value="">Select product…</option>
              {filteredProducts.map(p => (
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
                {lines.map(line => {
                  const lineTotal = line.quantity * line.salePrice * (1 - line.discount / 100)
                  const overQty = line.quantity > line.maxQty
                  return (
                    <tr key={line.key} className={overQty ? "bg-red-50" : "hover:bg-slate-50"}>
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
                          onClick={() => setLines(prev => prev.filter(l => l.key !== line.key))}
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
        ) /* closes the empty-items/table conditional */}
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
                <option value="CREDIT">Credit</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Paid</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                placeholder="0.00"
                className="h-9 text-right"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard-friendly add item flow */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="product-search">Add item</Label>
              <span className="text-xs text-slate-400">Press Enter to add, then keep typing</span>
            </div>
            <div className="flex gap-2">
              <Input
                ref={productSearchRef}
                id="product-search"
                list="available-products"
                value={productSearch}
                onChange={e => {
                  const value = e.target.value
                  setProductSearch(value)
                  setAddProductId(products.find(p => p.name === value)?.id || "")
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addLine()
                  }
                }}
                placeholder="Search product by name…"
                className="h-9"
                autoComplete="off"
              />
              <datalist id="available-products">
                {availableProducts.map(p => <option key={p.id} value={p.name} />)}
              </datalist>
              <Button type="button" size="sm" onClick={addLine} disabled={!addProductId && !products.some(p => p.name.toLowerCase() === productSearch.trim().toLowerCase())} className="h-9 shrink-0">
                <Plus className="h-4 w-4" />
                Add item
              </Button>
            </div>
          </div>
          <div className="text-sm text-slate-500 md:text-right">
            <span className="font-medium text-slate-900">{lines.length}</span> lines · FEFO batch auto-selected
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-3">
        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
            <p className="text-sm text-slate-400">Search for a product, press Enter, and continue adding items.</p>
            <p className="text-xs text-slate-300 mt-1">Designed for fast entry of 10–30 invoice lines.</p>
          </div>
        ) : (
          <>
            <div className="hidden rounded-xl border border-slate-200 md:block md:max-h-[55vh] md:overflow-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium text-slate-600">Product / Batch</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600">Avail</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 w-20">Qty</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 w-28">Price</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600 w-20">Disc%</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-600">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map(line => <LineRow key={line.key} line={line} updateLine={updateLine} removeLine={() => setLines(prev => prev.filter(l => l.key !== line.key))} />)}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 md:hidden">
              {lines.map(line => <LineCard key={line.key} line={line} updateLine={updateLine} removeLine={() => setLines(prev => prev.filter(l => l.key !== line.key))} />)}
            </div>
          </>
        )}
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-3" open={moreDetailsOpen} onToggle={e => setMoreDetailsOpen(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-900">
          More details
          <ChevronDown className={`h-4 w-4 transition-transform ${moreDetailsOpen ? "rotate-180" : ""}`} />
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Invoice Discount</Label>
            <Input type="number" min="0" step="0.01" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
      </details>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur md:left-auto md:right-4 md:bottom-4 md:w-[min(920px,calc(100vw-2rem))] md:rounded-2xl md:border">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
          <SummaryPill label="Items" value={String(lines.length)} />
          <SummaryPill label="Subtotal" value={formatCurrency(subtotal)} />
          <SummaryPill label="Discount" value={formatCurrency(disc)} />
          <SummaryPill label="Tax" value={formatCurrency(taxTotal)} />
          <SummaryPill label="Net" value={formatCurrency(net)} strong />
          <SummaryPill label="Paid" value={formatCurrency(paid)} />
          <SummaryPill label={balance > 0.001 ? "Balance" : balance < -0.001 ? "Change" : "Balance"} value={Math.abs(balance) < 0.001 ? "—" : formatCurrency(Math.abs(balance))} tone={balance > 0.001 ? "danger" : balance < -0.001 ? "success" : "default"} strong />
        </div>
        <div className="mt-3 flex gap-2">
          <Button type="submit" loading={submitting} disabled={lines.length === 0 || submitting} className="flex-1">
            Create Invoice
          </Button>
          <Button type="button" variant="outline" onClick={() => history.back()} className="shrink-0">
            Cancel
          </Button>
        </div>
      </div>
    </form>
  )
}

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={submitting} disabled={lines.length === 0 || submitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
     
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Field label="Qty"><LineNumberInput value={line.quantity} min="1" max={line.maxQty} onChange={value => updateLine(line.key, { quantity: Math.max(1, parseInt(value) || 1) })} error={overQty} /></Field>
        <Field label="Price"><LineNumberInput value={line.salePrice} min="0" step="0.01" onChange={value => updateLine(line.key, { salePrice: parseFloat(value) || 0 })} /></Field>
        <Field label="Disc%"><LineNumberInput value={line.discount} min="0" max="100" step="0.01" onChange={value => updateLine(line.key, { discount: parseFloat(value) || 0 })} /></Field>
      </div>
      <div className="mt-2 text-right text-sm font-semibold text-slate-900">{formatCurrency(lineTotal)}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 text-xs text-slate-500"><span>{label}</span>{children}</label>
}

function LineNumberInput({ value, onChange, min, max, step, error }: { value: number; onChange: (value: string) => void; min?: string | number; max?: string | number; step?: string; error?: boolean }) {
  return <Input type="number" min={min} max={max} step={step} value={value} onChange={e => onChange(e.target.value)} className={`h-8 text-right ${error ? "border-red-400 focus:ring-red-400" : ""}`} />
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-slate-300 hover:text-red-500 transition-colors p-1" aria-label="Remove item">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

function SummaryPill({ label, value, strong, tone = "default" }: { label: string; value: string; strong?: boolean; tone?: "default" | "danger" | "success" }) {
  const toneClass = tone === "danger" ? "text-red-600" : tone === "success" ? "text-green-600" : "text-slate-900"
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`${strong ? "font-bold" : "font-semibold"} ${toneClass}`}>{value}</div>
    </div>
  )
}

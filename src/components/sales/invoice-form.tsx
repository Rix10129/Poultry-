"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { ExpiryBadge } from "@/components/inventory/expiry-badge"
import { createInvoice, updateInvoice, deleteInvoiceDraft, saveInvoiceDraft } from "@/app/(dashboard)/sales/actions"
import { quickCreateCustomer } from "@/app/(dashboard)/customers/actions"
import { daysUntilExpiry, formatCurrency, CUSTOMER_TYPE_LABELS } from "@/lib/utils"
import { Plus, Trash2, AlertCircle, WifiOff, CheckCircle2, Save, UserPlus } from "lucide-react"
import { addToSalesQueue } from "@/lib/offline-db"
import { INVOICE_DRAFT_VERSION, type InvoiceDraftData } from "@/lib/invoice-draft"
import { lineBase, calculateDocumentTotals } from "@/lib/invoice-math"

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
  isBonus: boolean   // scheme/bonus giveaway — deducts stock, contributes zero revenue
  savedAvailable: number
  savedCatalogPrice: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function batchAvailable(batchId: string, batchTotal: number, lines: LineItem[]): number {
  const used = lines.reduce((s, l) => l.batchId === batchId ? s + l.quantity : s, 0)
  return Math.max(0, batchTotal - used)
}

function isSellableBatch(batch: BatchOption) {
  return daysUntilExpiry(batch.expiryDate) >= 0
}

// ── Component ─────────────────────────────────────────────────────────────────

interface EditContext {
  invoiceId: string
  invoiceNumber: string
  hasDependentRecords: boolean
  walkInCustomerName?: string | null
}

interface InvoiceFormProps {
  products: ProductOption[]
  customers: CustomerOption[]
  initialDraft?: (Omit<InvoiceDraftData, "lines"> & { id: string; lines: Array<InvoiceDraftData["lines"][number] & { maxQty: number }> }) | null
  draftWarnings?: string[]
  drafts?: Array<{ id: string; label: string; updatedAt: string }>
  editContext?: EditContext
}

export function InvoiceForm({ products, customers: initialCustomers, initialDraft, draftWarnings = [], drafts = [], editContext }: InvoiceFormProps) {
  const [lines, setLines] = useState<LineItem[]>(() => initialDraft?.lines.map(line => ({ ...line, isBonus: !!line.isBonus, key: crypto.randomUUID() })) ?? [])
  const [addProductId, setAddProductId] = useState("")
  const [productSearch, setProductSearch] = useState("")
  const [customers, setCustomers] = useState(initialCustomers)
  const [customerId, setCustomerId] = useState(initialDraft?.customerId ?? "")
  const [customerSearch, setCustomerSearch] = useState(editContext?.walkInCustomerName ?? "")
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [addCustomerError, setAddCustomerError] = useState<string | null>(null)
  // No customer account picked → whatever's typed in the search box IS the
  // customer name for this cash memo. One box, no second field to miss.
  const walkInCustomerName = customerId ? "" : customerSearch.trim()
  const [invoiceDate, setInvoiceDate] = useState(() => initialDraft?.invoiceDate ?? new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState(initialDraft?.dueDate ?? "")
  const [paymentMode, setPaymentMode] = useState(initialDraft?.paymentMode ?? "CASH")
  const [paidAmount, setPaidAmount] = useState(initialDraft?.paidAmount ?? "")
  const [discountAmount, setDiscountAmount] = useState(initialDraft?.discountAmount ?? "")
  const [notes, setNotes] = useState(initialDraft?.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [savedOffline, setSavedOffline] = useState(false)
  const [draftId, setDraftId] = useState(initialDraft?.id ?? "")
  const [draftStatus, setDraftStatus] = useState(initialDraft ? "Draft resumed" : "")
  const [confirmDependentEdit, setConfirmDependentEdit] = useState(false)

  // Products that still have some available stock (considering current lines)
  const availableProducts = useMemo(
    () => products.filter(p => p.batches.some(b => isSellableBatch(b) && batchAvailable(b.id, b.quantity, lines) > 0)),
    [products, lines]
  )
  const filteredProducts = useMemo(() => {
    const searchTerm = productSearch.trim().toLowerCase()
    if (!searchTerm) return availableProducts

    return availableProducts.filter((product) =>
      product.name.toLowerCase().includes(searchTerm)
    )
  }, [availableProducts, productSearch])

  const filteredCustomers = useMemo(() => {
    const searchTerm = customerSearch.trim().toLowerCase()
    if (!searchTerm) return customers
    // Always keep the currently selected customer visible even if a later
    // search term would otherwise filter it out of the list.
    return customers.filter((customer) =>
      customer.id === customerId || customer.name.toLowerCase().includes(searchTerm)
    )
  }, [customers, customerSearch, customerId])

  function addLine() {
    if (!addProductId) return
    const product = products.find(p => p.id === addProductId)
    if (!product) return

    // FEFO: pick the first batch (sorted by expiryDate ASC) with available stock
    let chosen: { batch: BatchOption; avail: number } | null = null
    for (const batch of product.batches) {
      const avail = batchAvailable(batch.id, batch.quantity, lines)
      if (isSellableBatch(batch) && avail > 0) { chosen = { batch, avail }; break }
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
      isBonus: false,
      savedAvailable: chosen.batch.quantity,
      savedCatalogPrice: parseFloat(product.salePrice) || 0,
    }

    setLines(prev => [...prev, line])
    setAddProductId("")
    setProductSearch("")
    setError(null)
  }

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  }

  async function handleQuickAddCustomer() {
    const name = customerSearch.trim()
    if (!name) return
    setAddingCustomer(true)
    setAddCustomerError(null)
    try {
      const result = await quickCreateCustomer(name)
      if ("error" in result) { setAddCustomerError(result.error); return }
      setCustomers(prev => prev.some(c => c.id === result.id) ? prev : [...prev, { id: result.id, name: result.name, type: "RETAIL" }])
      setCustomerId(result.id)
      setCustomerSearch(result.name)
    } catch {
      setAddCustomerError("Unexpected error — please try again")
    } finally {
      setAddingCustomer(false)
    }
  }

  // Computed totals
  const disc = parseFloat(discountAmount) || 0
  const paid = parseFloat(paidAmount) || 0

  const { totalAmount: subtotal, taxAmount: taxTotal, netAmount: net } = useMemo(
    () => calculateDocumentTotals(lines, l => l.salePrice, disc),
    [lines, disc]
  )

  const balance = net - paid
  const itemCountLabel = `${lines.length} line${lines.length === 1 ? "" : "s"}`

  const draftData = useMemo<InvoiceDraftData>(() => ({
    version: INVOICE_DRAFT_VERSION,
    customerId,
    customerName: customers.find(customer => customer.id === customerId)?.name ?? null,
    invoiceDate, dueDate, paymentMode, paidAmount, discountAmount, notes,
    lines: lines.map(line => ({
      productId: line.productId, productName: line.productName, unit: line.unit,
      batchId: line.batchId, batchNumber: line.batchNumber, expiryDate: line.expiryDate,
      quantity: line.quantity, salePrice: line.salePrice, discount: line.discount,
      taxRate: line.taxRate, isBonus: line.isBonus, savedAvailable: line.savedAvailable, savedCatalogPrice: line.savedCatalogPrice,
    })),
  }), [customerId, customers, invoiceDate, dueDate, paymentMode, paidAmount, discountAmount, notes, lines])

  async function persistDraft(automatic = false) {
    if (!navigator.onLine) { if (!automatic) setError("Connect to the internet to save a server draft"); return }
    if (!automatic) setDraftStatus("Saving…")
    const result = await saveInvoiceDraft({ ...draftData, id: draftId || undefined })
    if (result.error) { setError(result.error); setDraftStatus("Draft not saved"); return }
    if (result.id) setDraftId(result.id)
    setDraftStatus(`${automatic ? "Autosaved" : "Saved"} ${new Date(result.savedAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)
  }

  useEffect(() => {
    if (editContext) return
    if (!draftId && !lines.length && !customerId && !notes) return
    const timer = window.setTimeout(() => { void persistDraft(true) }, 1500)
    return () => window.clearTimeout(timer)
    // draftId is deliberately excluded: setting the ID after the first save must not schedule another save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftData])

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

    if (editContext?.hasDependentRecords && !confirmDependentEdit) {
      setError("This invoice has recorded payments or returns — check the confirmation box below to proceed")
      return
    }

    // A walk-in / cash-memo sale (no registered customer account) has no
    // ledger to carry a balance on — an unpaid amount here would be
    // uncollectible and invisible to Aging/Recovery reports. Selling on
    // credit requires picking the actual customer record from the list
    // above, not just typing their name in the search box.
    if (!customerId && balance > 0.001) {
      setError("This sale has no customer account selected, so it can't be left unpaid — search for and select the customer above to sell on credit, or collect full payment now for a cash memo.")
      return
    }

    setSubmitting(true)
    setError(null)

    if (editContext) {
      const fd = new FormData()
      fd.set("id", editContext.invoiceId)
      fd.set("customerId", customerId)
      fd.set("walkInCustomerName", walkInCustomerName)
      fd.set("invoiceDate", invoiceDate)
      fd.set("dueDate", dueDate)
      fd.set("paymentMode", paymentMode)
      fd.set("paidAmount", String(paid))
      fd.set("discountAmount", String(disc))
      fd.set("notes", notes)
      if (confirmDependentEdit) fd.set("confirmDependentEdit", "1")
      fd.set("linesJson", JSON.stringify(lines.map(l => ({
        productId: l.productId,
        batchId: l.batchId,
        quantity: l.quantity,
        salePrice: l.salePrice,
        discount: l.discount,
        taxRate: l.taxRate,
        isBonus: l.isBonus,
      }))))

      try {
        const result = await updateInvoice(null, fd)
        if (result?.error) {
          setError(result.error)
          setSubmitting(false)
        }
        // On success the server redirects — execution stops here
      } catch {
        setError("Unexpected error — please try again")
        setSubmitting(false)
      }
      return
    }

    // When offline, queue locally instead of calling the server
    if (!navigator.onLine) {
      try {
        await addToSalesQueue({
          customerId,
          walkInCustomerName,
          invoiceDate,
          dueDate,
          paymentMode,
          paidAmount: String(paid),
          discountAmount: String(disc),
          notes,
          linesJson: JSON.stringify(lines.map((l) => ({
            productId: l.productId,
            batchId: l.batchId,
            quantity: l.quantity,
            salePrice: l.salePrice,
            discount: l.discount,
            taxRate: l.taxRate,
            isBonus: l.isBonus,
          }))),
        })
        setSavedOffline(true)
      } catch {
        setError("Could not save offline — please try again")
      }
      setSubmitting(false)
      return
    }

    const fd = new FormData()
    fd.set("customerId", customerId)
    fd.set("walkInCustomerName", walkInCustomerName)
    fd.set("invoiceDate", invoiceDate)
    fd.set("dueDate", dueDate)
    fd.set("paymentMode", paymentMode)
    fd.set("paidAmount", String(paid))
    fd.set("discountAmount", String(disc))
    fd.set("notes", notes)
    if (draftId) fd.set("draftId", draftId)
    fd.set("linesJson", JSON.stringify(lines.map(l => ({
      productId: l.productId,
      batchId: l.batchId,
      quantity: l.quantity,
      salePrice: l.salePrice,
      discount: l.discount,
      taxRate: l.taxRate,
      isBonus: l.isBonus,
    }))))

    try {
      const result = await createInvoice(null, fd)
      if (result?.error) {
        setError(result.error)
        setSubmitting(false)
      }
      // On success the server redirects — execution stops here
    } catch {
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
    <form onSubmit={handleSubmit} className="space-y-4 pb-28">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {draftWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Review changes since this draft was saved</p>
          <ul className="mt-1 list-disc pl-5">{draftWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}

      {editContext?.hasDependentRecords && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">This invoice has recorded payments or returns</p>
          <p>Editing it will recalculate its totals and correct the accounting ledger to match. Only proceed if you&rsquo;re sure.</p>
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={confirmDependentEdit}
              onChange={e => setConfirmDependentEdit(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            I understand and want to proceed
          </label>
        </div>
      )}

      {!editContext && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="min-w-52 flex-1 space-y-1"><Label>Resume draft</Label><Select value={draftId} onChange={e => { if (e.target.value) window.location.assign(`/sales/new?draft=${e.target.value}`) }}><option value="">Select saved draft…</option>{drafts.map(d => <option key={d.id} value={d.id}>{d.label} — {new Date(d.updatedAt).toLocaleString()}</option>)}</Select></div>
          <Button type="button" variant="outline" onClick={() => void persistDraft()}><Save className="h-4 w-4" />Save Draft</Button>
          {draftId && <Button type="button" variant="outline" onClick={async () => { const result = await deleteInvoiceDraft(draftId); if (result.error) setError(result.error); else window.location.assign("/sales/new") }}><Trash2 className="h-4 w-4" />Delete Draft</Button>}
          <span className="w-full text-xs text-slate-500">{draftStatus || "Incomplete invoices autosave after changes; drafts never post stock or accounting."}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="customer-search">Customer</Label>
          <Input
            id="customer-search"
            value={customerSearch}
            onChange={e => setCustomerSearch(e.target.value)}
            placeholder="Search existing customer, or type a name for a cash sale…"
            autoComplete="off"
          />
          <Select value={customerId} onChange={e => setCustomerId(e.target.value)} disabled={editContext?.hasDependentRecords}>
            <option value="">Walk-in / Cash Sale</option>
            {filteredCustomers.map(c => <option key={c.id} value={c.id}>{c.name} — {CUSTOMER_TYPE_LABELS[c.type] ?? c.type}</option>)}
          </Select>
          {editContext?.hasDependentRecords && (
            <p className="text-xs text-slate-500">Customer can&rsquo;t be changed once payments are recorded.</p>
          )}
          {!customerId && walkInCustomerName && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1.5">
              <p className="text-xs text-amber-800">
                No account selected — this will be a cash memo showing <span className="font-medium">&ldquo;{walkInCustomerName}&rdquo;</span> as
                the customer, and must be paid in full. If they&rsquo;re a new customer who wants to buy on credit, save them first:
              </p>
              <Button type="button" size="sm" variant="outline" onClick={handleQuickAddCustomer} loading={addingCustomer} disabled={addingCustomer}>
                <UserPlus className="h-3.5 w-3.5" />
                Save &ldquo;{walkInCustomerName}&rdquo; as a new customer
              </Button>
              {addCustomerError && <p className="text-xs text-red-600">{addCustomerError}</p>}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Invoice Date</Label>
          <Input
            type="date"
            value={invoiceDate}
            onChange={e => setInvoiceDate(e.target.value)}
            required
            className="sm:w-40"
          />
        </div>
      </div>

      <section className="sticky top-2 z-20 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="product-search">Add item</Label>
            <Input
              id="product-search"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && addProductId) {
                  e.preventDefault()
                  addLine()
                }
              }}
              placeholder="Search product by name…"
              autoComplete="off"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="product-picker">Product</Label>
            <Select
              id="product-picker"
              value={addProductId}
              onChange={e => setAddProductId(e.target.value)}
            >
              <option value="">Select product…</option>
              {filteredProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={addLine} disabled={!addProductId} className="shrink-0">
            <Plus className="h-4 w-4" />
            Add item
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {itemCountLabel}{" · "}Earliest-expiry stock is selected automatically
        </p>
      </section>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Items</h3>
          <span className="text-xs text-slate-500">{availableProducts.length} sellable products</span>
        </div>

        {lines.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
            <p className="text-sm text-slate-400">Select a product above and click Add</p>
            <p className="text-xs text-slate-300 mt-1">FEFO batch is auto-selected</p>
          </div>
        )}

        {lines.length > 0 && (
          <div className="max-h-[42vh] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-slate-600">Product / Batch</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">Avail</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-24">Qty</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-32">Unit Price</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-20">Disc%</th>
                  <th className="text-center px-3 py-2.5 font-medium text-slate-600 w-16">Free</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map(line => {
                  const lineTotal = lineBase(line.quantity, line.salePrice, line.discount, line.isBonus)
                  const overQty = line.quantity > line.maxQty
                  return (
                    <tr key={line.key} className={overQty ? "bg-red-50" : line.isBonus ? "bg-amber-50" : "hover:bg-slate-50"}>
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
                          disabled={line.isBonus}
                          onChange={e =>
                            updateLine(line.key, { salePrice: parseFloat(e.target.value) || 0 })
                          }
                          className="text-right disabled:opacity-50"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={line.discount}
                          disabled={line.isBonus}
                          onChange={e =>
                            updateLine(line.key, { discount: parseFloat(e.target.value) || 0 })
                          }
                          className="text-right disabled:opacity-50"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={line.isBonus}
                          onChange={e => updateLine(line.key, { isBonus: e.target.checked })}
                          title="Scheme/bonus giveaway — deducts stock, no charge to the customer"
                          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                        {line.isBonus ? <span className="text-amber-700">FREE</span> : formatCurrency(lineTotal)}
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
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Payment */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Payment</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:inset-x-auto md:right-4 md:bottom-4 md:w-[min(720px,calc(100vw-2rem))] md:rounded-xl md:border">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">Net amount</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(net)}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => history.back()}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submitting}
              disabled={lines.length === 0 || submitting || (editContext?.hasDependentRecords && !confirmDependentEdit)}
            >
              {editContext ? "Save Changes" : "Create Invoice"}
            </Button>
          </div>
        </div>
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

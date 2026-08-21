"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { recordSupplierPayment } from "@/app/(dashboard)/suppliers/actions"
import { createVoucher } from "@/app/(dashboard)/accounts/actions"
import { AlertCircle } from "lucide-react"

export type SupplierOption = { id: string; name: string }
export type AccountOption = { id: string; code: string; name: string }

interface Props {
  suppliers: SupplierOption[]
  otherAccounts: AccountOption[]
  systemAccountIds: { CASH: string; BANK: string; CHEQUES_PAYABLE: string }
}

const OTHER = "__other__"

export function CashPaymentForm({ suppliers, otherAccounts, systemAccountIds }: Props) {
  const router = useRouter()
  const [paidTo, setPaidTo] = useState("")
  const [otherAccountId, setOtherAccountId] = useState("")
  const [paymentMode, setPaymentMode] = useState<"CASH" | "BANK" | "CHEQUE">("CASH")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isOther = paidTo === OTHER

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!paidTo) { setError("Select who this payment was made to"); return }
    const amt = parseFloat(amount) || 0
    if (amt <= 0) { setError("Amount must be greater than 0"); return }
    if (isOther && !otherAccountId) { setError("Select which account this expense belongs to (e.g. Operating Expenses)"); return }

    setSubmitting(true)
    try {
      if (isOther) {
        const fundAccountId = systemAccountIds[paymentMode === "BANK" ? "BANK" : paymentMode === "CHEQUE" ? "CHEQUES_PAYABLE" : "CASH"]
        const fd = new FormData()
        fd.set("voucherType", "CASH_PAYMENT")
        fd.set("entryDate", date)
        fd.set("description", notes || "Cash payment")
        fd.set("reference", reference)
        fd.set("linesJson", JSON.stringify([
          { debitAccountId: otherAccountId, creditAccountId: fundAccountId, amount: amt, description: notes || null },
        ]))
        const result = await createVoucher(null, fd)
        if (result?.error) { setError(result.error); setSubmitting(false); return }
      } else {
        const fd = new FormData()
        fd.set("supplierId", paidTo)
        fd.set("amount", String(amt))
        fd.set("paymentMode", paymentMode)
        fd.set("paymentDate", date)
        fd.set("reference", reference)
        fd.set("notes", notes)
        const result = await recordSupplierPayment(null, fd)
        if (result?.error) { setError(result.error); setSubmitting(false); return }
      }
      router.push("/accounts/vouchers")
    } catch {
      setError("Unexpected error — please try again")
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="paid-to">Paid To *</Label>
        <Select id="paid-to" value={paidTo} onChange={e => setPaidTo(e.target.value)}>
          <option value="">Select…</option>
          {suppliers.length > 0 && (
            <optgroup label="Suppliers">
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          )}
          <option value={OTHER}>Other (not a supplier)</option>
        </Select>
      </div>

      {isOther && (
        <div className="space-y-1.5">
          <Label htmlFor="other-account">Expense / Use (account) *</Label>
          <Select id="other-account" value={otherAccountId} onChange={e => setOtherAccountId(e.target.value)}>
            <option value="">Select account…</option>
            {otherAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </Select>
          <p className="text-xs text-slate-500">E.g. &ldquo;Operating Expenses&rdquo; for rent, utilities, etc.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount Paid</Label>
          <Input id="amount" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment-mode">Payment Mode</Label>
          <Select id="payment-mode" value={paymentMode} onChange={e => setPaymentMode(e.target.value as typeof paymentMode)}>
            <option value="CASH">Cash</option>
            <option value="BANK">Bank Transfer</option>
            <option value="CHEQUE">Cheque</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reference">Reference</Label>
          <Input id="reference" value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque no., receipt no.…" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      {!isOther && (
        <p className="text-xs text-slate-500">
          This records a general payment against the supplier&rsquo;s overall balance. To settle a specific
          purchase order, use the Record Payment button on that supplier&rsquo;s page instead.
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={submitting} disabled={submitting}>Save</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  )
}

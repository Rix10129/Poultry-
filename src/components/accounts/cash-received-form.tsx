"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { recordPayment } from "@/app/(dashboard)/customers/actions"
import { createVoucher } from "@/app/(dashboard)/accounts/actions"
import { AlertCircle } from "lucide-react"

export type CustomerOption = { id: string; name: string }
export type AccountOption = { id: string; code: string; name: string }

interface Props {
  customers: CustomerOption[]
  otherAccounts: AccountOption[]
  systemAccountIds: { CASH: string; BANK: string; CHEQUES_RECEIVABLE: string }
}

const OTHER = "__other__"

export function CashReceivedForm({ customers, otherAccounts, systemAccountIds }: Props) {
  const router = useRouter()
  const [receivedFrom, setReceivedFrom] = useState("")
  const [otherAccountId, setOtherAccountId] = useState("")
  const [paymentMode, setPaymentMode] = useState<"CASH" | "BANK" | "CHEQUE">("CASH")
  const [amount, setAmount] = useState("")
  const [discountAmount, setDiscountAmount] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isOther = receivedFrom === OTHER

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!receivedFrom) { setError("Select who this payment was received from"); return }
    const amt = parseFloat(amount) || 0
    const disc = Math.max(0, parseFloat(discountAmount) || 0)
    if (isOther && amt <= 0) { setError("Amount must be greater than 0"); return }
    if (!isOther && amt + disc <= 0) { setError("Enter an amount received or a discount"); return }
    if (isOther && !otherAccountId) { setError("Select which account this money is being received into (e.g. Sales Revenue, Opening Balance Equity)"); return }

    setSubmitting(true)
    try {
      if (isOther) {
        const fundAccountId = systemAccountIds[paymentMode === "BANK" ? "BANK" : paymentMode === "CHEQUE" ? "CHEQUES_RECEIVABLE" : "CASH"]
        const fd = new FormData()
        fd.set("voucherType", "CASH_RECEIPT")
        fd.set("entryDate", date)
        fd.set("description", notes || "Cash received")
        fd.set("reference", reference)
        fd.set("linesJson", JSON.stringify([
          { debitAccountId: fundAccountId, creditAccountId: otherAccountId, amount: amt, description: notes || null },
        ]))
        const result = await createVoucher(null, fd)
        if (result?.error) { setError(result.error); setSubmitting(false); return }
      } else {
        const fd = new FormData()
        fd.set("customerId", receivedFrom)
        fd.set("amount", String(amt))
        fd.set("discountAmount", String(disc))
        fd.set("paymentMode", paymentMode)
        fd.set("paymentDate", date)
        fd.set("reference", reference)
        fd.set("notes", notes)
        const result = await recordPayment(null, fd)
        if (result?.error) { setError(result.error); setSubmitting(false); return }
      }
      // On success both actions redirect server-side; this is a fallback
      // in case a result without a redirect ever comes back.
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
        <Label htmlFor="received-from">Received From *</Label>
        <Select id="received-from" value={receivedFrom} onChange={e => setReceivedFrom(e.target.value)}>
          <option value="">Select…</option>
          {customers.length > 0 && (
            <optgroup label="Customers">
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          )}
          <option value={OTHER}>Other (not a customer)</option>
        </Select>
      </div>

      {isOther && (
        <div className="space-y-1.5">
          <Label htmlFor="other-account">Received Into (account) *</Label>
          <Select id="other-account" value={otherAccountId} onChange={e => setOtherAccountId(e.target.value)}>
            <option value="">Select account…</option>
            {otherAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </Select>
          <p className="text-xs text-slate-500">
            E.g. &ldquo;Sales Revenue&rdquo; for other income, or &ldquo;Opening Balance Equity&rdquo; for a capital injection.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount Received{!isOther && " (or leave as a discount below)"}</Label>
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
        {!isOther && (
          <div className="space-y-1.5">
            <Label htmlFor="discount">Discount / Write-off</Label>
            <Input id="discount" type="number" min="0" step="0.01" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} placeholder="0.00" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reference">Reference</Label>
          <Input id="reference" value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque no., receipt no.…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      {!isOther && (
        <p className="text-xs text-slate-500">
          This records a general payment against the customer&rsquo;s overall balance. To settle a specific invoice, use
          the Record Payment button on that customer&rsquo;s page instead.
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={submitting} disabled={submitting}>Save</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  )
}

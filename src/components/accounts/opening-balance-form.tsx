"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { updateCustomerOpeningBalance } from "@/app/(dashboard)/customers/actions"
import { updateSupplierOpeningBalance } from "@/app/(dashboard)/suppliers/actions"
import { createVoucher } from "@/app/(dashboard)/accounts/actions"
import { AlertCircle } from "lucide-react"

export type PartyOption = { id: string; name: string; openingBalance: number }
export type AccountOption = { id: string; code: string; name: string; type: string }

interface Props {
  customers: PartyOption[]
  suppliers: PartyOption[]
  glAccounts: AccountOption[]
  openingEquityAccountId: string
}

// Assets and expenses normally carry a debit balance; liabilities, equity,
// and revenue normally carry a credit balance. Which side the entered
// opening balance goes on is derived from that, so the user never has to
// think in Dr/Cr terms — they just say what the account's balance is.
const DEBIT_NORMAL_TYPES = new Set(["ASSET", "EXPENSE"])

export function OpeningBalanceForm({ customers, suppliers, glAccounts, openingEquityAccountId }: Props) {
  const router = useRouter()
  const [kind, setKind] = useState<"customer" | "supplier" | "account" | "">("")
  const [selectedId, setSelectedId] = useState("")
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const options = kind === "customer" ? customers : kind === "supplier" ? suppliers : []
  const selectedAccount = glAccounts.find(a => a.id === selectedId)

  const currentBalance = kind === "account" ? null : (options.find(o => o.id === selectedId)?.openingBalance ?? null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!kind || !selectedId) { setError("Select who or which account this opening balance is for"); return }
    const amt = Math.max(0, parseFloat(amount) || 0)

    setSubmitting(true)
    try {
      if (kind === "customer") {
        const fd = new FormData()
        fd.set("id", selectedId)
        fd.set("openingBalance", String(amt))
        const result = await updateCustomerOpeningBalance(null, fd)
        if (result?.error) { setError(result.error); setSubmitting(false); return }
      } else if (kind === "supplier") {
        const fd = new FormData()
        fd.set("id", selectedId)
        fd.set("openingBalance", String(amt))
        const result = await updateSupplierOpeningBalance(null, fd)
        if (result?.error) { setError(result.error); setSubmitting(false); return }
      } else {
        if (amt <= 0) { setError("Amount must be greater than 0"); return }
        const isDebitNormal = selectedAccount ? DEBIT_NORMAL_TYPES.has(selectedAccount.type) : true
        const line = isDebitNormal
          ? { debitAccountId: selectedId, creditAccountId: openingEquityAccountId, amount: amt, description: null }
          : { debitAccountId: openingEquityAccountId, creditAccountId: selectedId, amount: amt, description: null }
        const fd = new FormData()
        fd.set("voucherType", "OPENING_BALANCE")
        fd.set("entryDate", new Date().toISOString().split("T")[0])
        fd.set("description", `Opening balance — ${selectedAccount?.name ?? ""}`)
        fd.set("reference", "")
        fd.set("linesJson", JSON.stringify([line]))
        const result = await createVoucher(null, fd)
        if (result?.error) { setError(result.error); setSubmitting(false); return }
      }
      router.push("/accounts")
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
        <Label htmlFor="ob-kind">Set opening balance for</Label>
        <Select id="ob-kind" value={kind} onChange={e => { setKind(e.target.value as typeof kind); setSelectedId("") }}>
          <option value="">Select…</option>
          <option value="customer">A Customer</option>
          <option value="supplier">A Supplier</option>
          <option value="account">A Chart of Accounts entry (e.g. Bank, Cash)</option>
        </Select>
      </div>

      {(kind === "customer" || kind === "supplier") && (
        <div className="space-y-1.5">
          <Label htmlFor="ob-party">{kind === "customer" ? "Customer" : "Supplier"} *</Label>
          <Select id="ob-party" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            <option value="">Select…</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </div>
      )}

      {kind === "account" && (
        <div className="space-y-1.5">
          <Label htmlFor="ob-account">Account *</Label>
          <Select id="ob-account" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            <option value="">Select…</option>
            {glAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </Select>
        </div>
      )}

      {selectedId && currentBalance !== null && (
        <p className="text-xs text-slate-500">Current opening balance on file: {currentBalance.toLocaleString()}</p>
      )}

      {selectedId && (
        <div className="space-y-1.5">
          <Label htmlFor="ob-amount">Opening Balance Amount</Label>
          <Input id="ob-amount" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          {kind !== "account" && (
            <p className="text-xs text-slate-500">This replaces the existing opening balance — it isn&rsquo;t added on top of it.</p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={submitting} disabled={submitting || !selectedId}>Save</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  )
}

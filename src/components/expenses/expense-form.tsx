"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createExpense } from "@/app/(dashboard)/expenses/actions"
import { AlertCircle } from "lucide-react"

const CATEGORIES = [
  { value: "FUEL",         label: "Fuel / Petrol" },
  { value: "VEHICLE",      label: "Vehicle Maintenance" },
  { value: "SALARY",       label: "Salary & Wages" },
  { value: "RENT",         label: "Rent" },
  { value: "UTILITIES",    label: "Utilities" },
  { value: "OFFICE",       label: "Office Supplies" },
  { value: "MARKETING",    label: "Marketing & Samples" },
  { value: "BANK_CHARGES", label: "Bank Charges" },
  { value: "OTHER",        label: "Other" },
]

const MODES = [
  { value: "CASH",   label: "Cash" },
  { value: "BANK",   label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
]

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

export function ExpenseForm() {
  const [state, formAction, pending] = useActionState(createExpense, null)

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="expenseDate">Date *</Label>
          <Input id="expenseDate" name="expenseDate" type="date" defaultValue={todayString()} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category *</Label>
          <Select id="category" name="category" required>
            <option value="">Select category…</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description *</Label>
        <Input id="description" name="description" placeholder="e.g. Petrol for delivery van" required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount (PKR) *</Label>
          <Input id="amount" name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paymentMode">Payment Mode *</Label>
          <Select id="paymentMode" name="paymentMode" required>
            <option value="">Select mode…</option>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reference">Reference (optional)</Label>
        <Input id="reference" name="reference" placeholder="Receipt #, voucher #, etc." />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input id="notes" name="notes" placeholder="Any additional details…" />
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Save Expense
        </Button>
      </div>
    </form>
  )
}

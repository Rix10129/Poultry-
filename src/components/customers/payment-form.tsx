"use client"

import { useState, useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { recordPayment } from "@/app/(dashboard)/customers/actions"
import { formatCurrency } from "@/lib/utils"
import { AlertCircle, CreditCard, X } from "lucide-react"

export type UnpaidInvoice = {
  id: string
  invoiceNumber: string
  balance: number
}

interface Props {
  customerId: string
  unpaidInvoices: UnpaidInvoice[]
}

export function PaymentForm({ customerId, unpaidInvoices }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(recordPayment, null)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
      >
        <CreditCard className="h-4 w-4" />
        Record Payment
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-green-900">Record Payment</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-green-600 hover:text-green-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="customerId" value={customerId} />

        {state?.error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{state.error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount *</Label>
            <Input
              id="pay-amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="0.00"
              className="bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-mode">Payment Mode</Label>
            <Select id="pay-mode" name="paymentMode" className="bg-white">
              <option value="CASH">Cash</option>
              <option value="BANK">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Date</Label>
            <Input
              id="pay-date"
              name="paymentDate"
              type="date"
              defaultValue={new Date().toISOString().split("T")[0]}
              className="bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-invoice">Link to Invoice</Label>
            <Select id="pay-invoice" name="invoiceId" className="bg-white">
              <option value="">General payment</option>
              {unpaidInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — bal {formatCurrency(inv.balance)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Reference / Cheque No.</Label>
            <Input
              id="pay-ref"
              name="reference"
              placeholder="Optional"
              className="bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notes</Label>
            <Input
              id="pay-notes"
              name="notes"
              placeholder="Optional"
              className="bg-white"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" size="sm" loading={pending} disabled={pending}
            className="bg-green-600 hover:bg-green-700">
            Save Payment
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}

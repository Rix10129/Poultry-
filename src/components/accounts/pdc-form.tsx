"use client"

import { useState } from "react"
import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createPDC, updatePDC } from "@/app/(dashboard)/accounts/pdc/actions"
import { AlertCircle } from "lucide-react"

interface Props {
  customers: { id: string; name: string }[]
  suppliers: { id: string; name: string }[]
  initialValues?: { id: string; type: "RECEIVABLE" | "PAYABLE"; customerId: string; supplierId: string; chequeNumber: string; bankName: string; chequeDate: string; amount: string; notes: string }
  mode?: "create" | "edit"
}

export function PDCForm({ customers, suppliers, initialValues, mode = initialValues ? "edit" : "create" }: Props) {
  const [state, formAction, pending] = useActionState(mode === "edit" ? updatePDC : createPDC, null)
  const [type, setType] = useState<"RECEIVABLE" | "PAYABLE">(initialValues?.type ?? "RECEIVABLE")

  return (
    <form action={formAction} className="space-y-5">
      {initialValues && <input type="hidden" name="id" value={initialValues.id} />}
      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {state.error}
        </div>
      )}

      {/* Type toggle */}
      <div className="space-y-1.5">
        <Label>Cheque Type</Label>
        <div className="flex gap-2">
          {(["RECEIVABLE", "PAYABLE"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                type === t
                  ? t === "RECEIVABLE"
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-purple-600 text-white border-purple-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {t === "RECEIVABLE" ? "Receivable (from Customer)" : "Payable (to Supplier)"}
            </button>
          ))}
        </div>
        <input type="hidden" name="type" value={type} />
      </div>

      {/* Party select */}
      {type === "RECEIVABLE" ? (
        <div className="space-y-1.5">
          <Label htmlFor="customerId">Customer *</Label>
          <Select id="customerId" name="customerId" defaultValue={initialValues?.customerId ?? ""} required>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="supplierId">Supplier *</Label>
          <Select id="supplierId" name="supplierId" defaultValue={initialValues?.supplierId ?? ""} required>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="chequeNumber">Cheque Number *</Label>
          <Input id="chequeNumber" name="chequeNumber" defaultValue={initialValues?.chequeNumber} placeholder="e.g. 0012345" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bankName">Bank Name</Label>
          <Input id="bankName" name="bankName" defaultValue={initialValues?.bankName} placeholder="e.g. HBL, UBL, MCB" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chequeDate">Cheque Date *</Label>
          <Input id="chequeDate" name="chequeDate" type="date" defaultValue={initialValues?.chequeDate} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount (PKR) *</Label>
          <Input id="amount" name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" defaultValue={initialValues?.amount} required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input id="notes" name="notes" defaultValue={initialValues?.notes} placeholder="Any additional details…" />
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {mode === "edit" ? "Save Changes" : "Save Cheque"}
        </Button>
      </div>
    </form>
  )
}

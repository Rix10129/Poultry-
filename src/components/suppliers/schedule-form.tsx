"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createPaymentSchedule, updateSupplierPaymentSchedule } from "@/app/(dashboard)/suppliers/schedule/actions"
import { AlertCircle } from "lucide-react"

type Supplier = { id: string; name: string }

interface ScheduleFormProps {
  suppliers: Supplier[]
  initialValues?: { id: string; supplierId: string; description: string; dueDate: string; amount: string; notes: string | null }
  mode?: "create" | "edit"
}

export function ScheduleForm({ suppliers, initialValues, mode = initialValues ? "edit" : "create" }: ScheduleFormProps) {
  const [state, formAction, pending] = useActionState(mode === "edit" ? updateSupplierPaymentSchedule : createPaymentSchedule, null)

  return (
    <form action={formAction} className="space-y-5">
      {initialValues && <input type="hidden" name="id" value={initialValues.id} />}
      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="supplierId">Supplier *</Label>
        <Select id="supplierId" name="supplierId" defaultValue={initialValues?.supplierId ?? ""} required>
          <option value="">Select supplier…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description *</Label>
        <Input
          id="description"
          name="description"
          placeholder="e.g. Invoice #INV-001 balance"
          defaultValue={initialValues?.description}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="dueDate">Due Date *</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={initialValues?.dueDate}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount *</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            defaultValue={initialValues?.amount}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Input
          id="notes"
          name="notes"
          defaultValue={initialValues?.notes ?? ""}
          placeholder="Optional notes"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={pending} disabled={pending}>
          {mode === "edit" ? "Save Changes" : "Add Schedule"}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
      </div>
    </form>
  )
}

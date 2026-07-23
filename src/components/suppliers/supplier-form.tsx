"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createSupplier, updateSupplier } from "@/app/(dashboard)/suppliers/actions"
import { AlertCircle } from "lucide-react"

export type SupplierData = {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  taxNumber: string | null
  openingBalance: string
}

interface Props {
  supplier?: SupplierData
  canEditOpeningBalance?: boolean
}

export function SupplierForm({ supplier, canEditOpeningBalance = true }: Props) {
  const action = supplier ? updateSupplier : createSupplier
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-4">
      {supplier && <input type="hidden" name="id" value={supplier.id} />}

      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={supplier?.name}
            placeholder="Supplier / distributor name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={supplier?.phone ?? ""}
            placeholder="+92 300 000 0000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={supplier?.email ?? ""}
            placeholder="info@supplier.com"
          />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            name="address"
            defaultValue={supplier?.address ?? ""}
            placeholder="Street, city, country"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="taxNumber">Tax / NTN Number</Label>
          <Input
            id="taxNumber"
            name="taxNumber"
            defaultValue={supplier?.taxNumber ?? ""}
            placeholder="Optional"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="openingBalance">Opening Balance (owed to them)</Label>
          <Input
            id="openingBalance"
            name="openingBalance"
            type="number"
            min="0"
            step="0.01"
            defaultValue={supplier?.openingBalance ?? "0"}
            placeholder="0.00"
            disabled={!canEditOpeningBalance}
          />
          <p className="text-xs text-slate-500">
            Changing opening balance will change outstanding/ledger totals.
          </p>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={pending} disabled={pending}>
          {supplier ? "Save Changes" : "Create Supplier"}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

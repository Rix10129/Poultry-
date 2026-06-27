"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createCustomer, updateCustomer } from "@/app/(dashboard)/customers/actions"
import { AlertCircle } from "lucide-react"

export type CustomerData = {
  id: string
  name: string
  type: string
  phone: string | null
  email: string | null
  address: string | null
  area: string | null
  creditLimit: string
  openingBalance: string
}

interface Props {
  customer?: CustomerData
}

const TYPE_OPTIONS = [
  { value: "RETAIL", label: "Retail" },
  { value: "FARM", label: "Farm" },
  { value: "VET_SHOP", label: "Vet Shop" },
  { value: "SUB_DEALER", label: "Sub-Dealer" },
]

export function CustomerForm({ customer }: Props) {
  const action = customer ? updateCustomer : createCustomer
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}

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
            defaultValue={customer?.name}
            placeholder="Customer / business name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type">Customer Type</Label>
          <Select id="type" name="type" defaultValue={customer?.type ?? "RETAIL"}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="area">Area / Territory</Label>
          <Input
            id="area"
            name="area"
            defaultValue={customer?.area ?? ""}
            placeholder="City, district, route…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={customer?.phone ?? ""}
            placeholder="+92 300 000 0000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={customer?.email ?? ""}
            placeholder="Optional"
          />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            name="address"
            defaultValue={customer?.address ?? ""}
            placeholder="Street, city"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="creditLimit">Credit Limit</Label>
          <Input
            id="creditLimit"
            name="creditLimit"
            type="number"
            min="0"
            step="0.01"
            defaultValue={customer?.creditLimit ?? "0"}
            placeholder="0.00"
          />
        </div>
        {!customer && (
          <div className="space-y-1.5">
            <Label htmlFor="openingBalance">Opening Balance (they owe us)</Label>
            <Input
              id="openingBalance"
              name="openingBalance"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              placeholder="0.00"
            />
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={pending} disabled={pending}>
          {customer ? "Save Changes" : "Create Customer"}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

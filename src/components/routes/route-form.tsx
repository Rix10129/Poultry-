"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createRoute, updateRoute } from "@/app/(dashboard)/routes/actions"
import { AlertCircle } from "lucide-react"

type Salesman = { id: string; name: string | null }

interface RouteFormProps {
  salesmen: Salesman[]
  defaultValues?: {
    id: string
    name: string
    description: string | null
    salesmanId: string | null
  }
}

export function RouteForm({ salesmen, defaultValues }: RouteFormProps) {
  const action = defaultValues ? updateRoute : createRoute
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-5">
      {defaultValues && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Route Name *</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaultValues?.name}
          placeholder="e.g. North Lahore Route"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          defaultValue={defaultValues?.description ?? ""}
          placeholder="Optional notes about this route"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="salesmanId">Assigned Salesman</Label>
        <Select id="salesmanId" name="salesmanId" defaultValue={defaultValues?.salesmanId ?? ""}>
          <option value="">— Unassigned —</option>
          {salesmen.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={pending} disabled={pending}>
          {defaultValues ? "Save Changes" : "Create Route"}
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
      </div>
    </form>
  )
}

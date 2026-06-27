"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createAccount, updateAccount } from "@/app/(dashboard)/accounts/actions"
import { AlertCircle } from "lucide-react"

export type AccountData = {
  id: string
  code: string
  name: string
  type: string
  parentId: string | null
  isSystem: boolean
}

export type AccountOption = {
  id: string
  code: string
  name: string
  type: string
}

interface Props {
  account?: AccountData
  accounts: AccountOption[]
}

const TYPE_OPTIONS = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "REVENUE", label: "Revenue" },
  { value: "EXPENSE", label: "Expense" },
]

export function AccountForm({ account, accounts }: Props) {
  const action = account ? updateAccount : createAccount
  const [state, formAction, pending] = useActionState(action, null)

  // Filter out self from parent options to prevent circular references
  const parentOptions = accounts.filter((a) => a.id !== account?.id)

  return (
    <form action={formAction} className="space-y-4">
      {account && <input type="hidden" name="id" value={account.id} />}

      {state?.error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="code">Account Code *</Label>
          <Input
            id="code"
            name="code"
            required
            defaultValue={account?.code}
            placeholder="e.g. 1001, 2100, 4001"
            disabled={account?.isSystem}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type">Type *</Label>
          <Select
            id="type"
            name="type"
            defaultValue={account?.type ?? "ASSET"}
            disabled={account?.isSystem}
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="name">Account Name *</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={account?.name}
            placeholder="e.g. Cash in Hand, Trade Payables"
            disabled={account?.isSystem}
          />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="parentId">Parent Account (optional)</Label>
          <Select id="parentId" name="parentId" defaultValue={account?.parentId ?? ""}>
            <option value="">— No parent —</option>
            {parentOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {account?.isSystem ? (
        <p className="text-sm text-slate-500 italic">System accounts cannot be modified.</p>
      ) : (
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={pending} disabled={pending}>
            {account ? "Save Changes" : "Create Account"}
          </Button>
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Cancel
          </Button>
        </div>
      )}
    </form>
  )
}

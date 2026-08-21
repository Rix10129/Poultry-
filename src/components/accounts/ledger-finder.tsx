"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

export type PartyOption = { id: string; name: string }
export type AccountOption = { id: string; code: string; name: string }

interface Props {
  customers: PartyOption[]
  suppliers: PartyOption[]
  accounts: AccountOption[]
}

export function LedgerFinder({ customers, suppliers, accounts }: Props) {
  const router = useRouter()
  const [kind, setKind] = useState<"customer" | "supplier" | "account" | "">("")
  const [selectedId, setSelectedId] = useState("")

  const options = kind === "customer" ? customers : kind === "supplier" ? suppliers : kind === "account" ? accounts : []

  function view() {
    if (!selectedId) return
    if (kind === "customer") router.push(`/customers/${selectedId}/statement`)
    else if (kind === "supplier") router.push(`/suppliers/${selectedId}`)
    else if (kind === "account") router.push(`/accounts/${selectedId}`)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ledger-kind">Show ledger for</Label>
        <Select id="ledger-kind" value={kind} onChange={e => { setKind(e.target.value as typeof kind); setSelectedId("") }}>
          <option value="">Select…</option>
          <option value="customer">A Customer</option>
          <option value="supplier">A Supplier</option>
          <option value="account">A Chart of Accounts entry</option>
        </Select>
      </div>

      {kind && (
        <div className="space-y-1.5">
          <Label htmlFor="ledger-party">{kind === "customer" ? "Customer" : kind === "supplier" ? "Supplier" : "Account"} *</Label>
          <Select id="ledger-party" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            <option value="">Select…</option>
            {options.map(o => (
              <option key={o.id} value={o.id}>
                {"code" in o ? `${(o as AccountOption).code} — ${o.name}` : o.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="pt-2">
        <Button type="button" onClick={view} disabled={!selectedId}>View Ledger</Button>
      </div>
    </div>
  )
}

"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { createVoucher, updateVoucher } from "@/app/(dashboard)/accounts/actions"
import { formatCurrency } from "@/lib/utils"
import { Plus, Trash2, AlertCircle } from "lucide-react"

export type AccountOption = {
  id: string
  code: string
  name: string
  type: string
}

type VoucherLine = {
  key: string
  debitAccountId: string
  creditAccountId: string
  amount: number
  description: string
}

const VOUCHER_TYPES = [
  { value: "CASH_RECEIPT", label: "Cash Receipt" },
  { value: "CASH_PAYMENT", label: "Cash Payment" },
  { value: "BANK_RECEIPT", label: "Bank Receipt" },
  { value: "BANK_PAYMENT", label: "Bank Payment" },
  { value: "JOURNAL", label: "Journal Voucher" },
]

interface Props {
  accounts: AccountOption[]
  defaultType?: string
  initialValues?: { id: string; voucherType: string; entryDate: string; description: string; reference: string; lines: VoucherLine[] }
  mode?: "create" | "edit"
}

export function VoucherForm({ accounts, defaultType = "JOURNAL", initialValues, mode = initialValues ? "edit" : "create" }: Props) {
  const [lines, setLines] = useState<VoucherLine[]>(initialValues?.lines ?? [
    { key: crypto.randomUUID(), debitAccountId: "", creditAccountId: "", amount: 0, description: "" },
  ])
  const [voucherType, setVoucherType] = useState(initialValues?.voucherType ?? defaultType)
  const [entryDate, setEntryDate] = useState(() => initialValues?.entryDate ?? new Date().toISOString().split("T")[0])
  const [description, setDescription] = useState(initialValues?.description ?? "")
  const [reference, setReference] = useState(initialValues?.reference ?? "")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const totalAmount = useMemo(
    () => lines.reduce((s, l) => s + (l.amount || 0), 0),
    [lines]
  )

  const totalDebits = useMemo(
    () => lines.filter((l) => l.debitAccountId).reduce((s, l) => s + (l.amount || 0), 0),
    [lines]
  )
  const totalCredits = useMemo(
    () => lines.filter((l) => l.creditAccountId).reduce((s, l) => s + (l.amount || 0), 0),
    [lines]
  )
  const balanced = Math.abs(totalDebits - totalCredits) < 0.001

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: crypto.randomUUID(), debitAccountId: "", creditAccountId: "", amount: 0, description: "" },
    ])
  }

  function updateLine(key: string, patch: Partial<VoucherLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removeLine(key: string) {
    if (lines.length === 1) return
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) { setError("Description is required"); return }

    for (const line of lines) {
      if (!line.debitAccountId && !line.creditAccountId) {
        setError("Each line needs at least a debit or credit account"); return
      }
      if (!line.amount || line.amount <= 0) {
        setError("All line amounts must be greater than 0"); return
      }
    }

    if (!balanced) {
      setError(`Total debits (${formatCurrency(totalDebits)}) must equal total credits (${formatCurrency(totalCredits)})`)
      return
    }

    setSubmitting(true)
    setError(null)

    const fd = new FormData()
    fd.set("voucherType", voucherType)
    fd.set("entryDate", entryDate)
    fd.set("description", description)
    fd.set("reference", reference)
    fd.set(
      "linesJson",
      JSON.stringify(
        lines.map((l) => ({
          debitAccountId: l.debitAccountId || null,
          creditAccountId: l.creditAccountId || null,
          amount: l.amount,
          description: l.description,
        }))
      )
    )

    try {
      if (initialValues) fd.set("id", initialValues.id)
      const result = await (mode === "edit" ? updateVoucher : createVoucher)(null, fd)
      if (result?.error) {
        setError(result.error)
        setSubmitting(false)
      }
    } catch {
      setError("Unexpected error — please try again")
      setSubmitting(false)
    }
  }

  const accountOptions = accounts.map((a) => (
    <option key={a.id} value={a.id}>
      {a.code} — {a.name}
    </option>
  ))

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Voucher Type</Label>
          <Select value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
            {VOUCHER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Reference</Label>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Cheque no., receipt no.…"
          />
        </div>
        <div className="md:col-span-3 space-y-1.5">
          <Label>Description *</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this voucher"
            required
          />
        </div>
      </div>

      {/* Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Lines
            <span className="ml-2 text-slate-400 font-normal">({lines.length})</span>
          </h3>
          <Button type="button" size="sm" variant="outline" onClick={addLine}>
            <Plus className="h-4 w-4" />
            Add Line
          </Button>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">Description</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 w-64">Debit Account</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600 w-64">Credit Account</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-32">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line) => (
                <tr key={line.key} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                      placeholder="Optional"
                      className="text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={line.debitAccountId}
                      onChange={(e) => updateLine(line.key, { debitAccountId: e.target.value })}
                      className="text-sm"
                    >
                      <option value="">—</option>
                      {accountOptions}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={line.creditAccountId}
                      onChange={(e) => updateLine(line.key, { creditAccountId: e.target.value })}
                      className="text-sm"
                    >
                      <option value="">—</option>
                      {accountOptions}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.amount || ""}
                      onChange={(e) => updateLine(line.key, { amount: parseFloat(e.target.value) || 0 })}
                      className="text-right text-sm"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                      className="text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-xs text-slate-500 text-right">
                  <span className="mr-4">Dr: {formatCurrency(totalDebits)}</span>
                  <span>Cr: {formatCurrency(totalCredits)}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`font-semibold text-sm ${balanced ? "text-green-600" : "text-red-600"}`}
                  >
                    {formatCurrency(totalAmount)}
                    {!balanced && " ⚠"}
                  </span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {!balanced && lines.some((l) => l.amount > 0) && (
          <p className="text-xs text-red-600">
            Debit and credit totals must be equal before saving.
          </p>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={submitting} disabled={submitting}>
          Post Voucher
        </Button>
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

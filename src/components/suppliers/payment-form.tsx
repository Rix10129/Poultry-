"use client"

import { useActionState, useState } from "react"
import { recordSupplierPayment, updateSupplierPayment, voidSupplierPayment } from "@/app/(dashboard)/suppliers/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { CreditCard, Pencil, X } from "lucide-react"
import { ReasonField } from "@/components/ui/reason-field"

type Purchase = { id: string; poNumber: string; balance: number }
type Payment = { id: string; amount: string; paymentMode: string; paymentDate: string; purchaseOrderId: string | null; reference: string | null; notes: string | null }

function Fields({ purchases, payment }: { purchases: Purchase[]; payment?: Payment }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div><Label>Amount *</Label><Input name="amount" type="number" min="0.01" step="0.01" required defaultValue={payment?.amount} /></div>
    <div><Label>Payment mode *</Label><Select name="paymentMode" defaultValue={payment?.paymentMode ?? "CASH"}><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CHEQUE">Cheque</option></Select></div>
    <div><Label>Date *</Label><Input name="paymentDate" type="date" required defaultValue={payment?.paymentDate ?? new Date().toISOString().slice(0, 10)} /></div>
    <div><Label>Purchase-order allocation</Label><Select name="purchaseOrderId" defaultValue={payment?.purchaseOrderId ?? ""}><option value="">General payment</option>{purchases.map(p => <option key={p.id} value={p.id}>{p.poNumber} — {p.balance.toFixed(2)} due</option>)}</Select></div>
    <div><Label>Reference / cheque no.</Label><Input name="reference" defaultValue={payment?.reference ?? ""} /></div>
    <div><Label>Notes</Label><Input name="notes" defaultValue={payment?.notes ?? ""} /></div>
  </div>
}

export function SupplierPaymentForm({ supplierId, purchases }: { supplierId: string; purchases: Purchase[] }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(recordSupplierPayment, null)
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}><CreditCard className="h-4 w-4" />Record Payment</Button>
  return <form action={action} className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
    <input type="hidden" name="supplierId" value={supplierId} />
    <div className="flex justify-between"><h2 className="font-semibold text-green-900">Record supplier payment</h2><button type="button" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button></div>
    {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    <Fields purchases={purchases} />
    <Button type="submit" size="sm" loading={pending}>Save Payment</Button>
  </form>
}

export function SupplierPaymentControls({ payment, purchases }: { payment: Payment; purchases: Purchase[] }) {
  const [editing, setEditing] = useState(false)
  const [editState, editAction, editingPending] = useActionState(updateSupplierPayment, null)
  const [voidState, voidAction, voidPending] = useActionState(voidSupplierPayment, null)
  if (editing) return <form action={editAction} className="p-3 bg-amber-50 space-y-3">
    <input type="hidden" name="paymentId" value={payment.id} />
    {editState?.error && <p className="text-xs text-red-700">{editState.error}</p>}
    <Fields purchases={purchases} payment={payment} />
    <div className="flex gap-2"><Button size="sm" loading={editingPending}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
  </form>
  return <div className="flex justify-end gap-2">
    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
    <form action={voidAction} className="flex items-center gap-2">
      <input type="hidden" name="paymentId" value={payment.id} />
      <ReasonField triggerLabel="Void" pending={voidPending} />
      {voidState?.error && <span className="text-xs text-red-700">{voidState.error}</span>}
    </form>
  </div>
}

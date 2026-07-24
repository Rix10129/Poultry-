"use client"
import { useActionState } from "react"
import { updateInvoice } from "@/app/(dashboard)/sales/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Line = { productId:string; batchId:string; name:string; batch:string; quantity:number; salePrice:number; discount:number; taxRate:number }
export function InvoiceEditForm({ invoice, customers, dependent, canOverride }: { invoice:{id:string; customerId:string; invoiceDate:string; dueDate:string; paymentMode:string; paidAmount:string; discountAmount:string; notes:string; lines:Line[]}; customers:{id:string;name:string}[]; dependent:boolean; canOverride:boolean }) {
 const [state, action, pending] = useActionState(updateInvoice, null)
 return <form action={action} className="space-y-4"><input type="hidden" name="id" value={invoice.id}/><input type="hidden" name="linesJson" value={JSON.stringify(invoice.lines.map(({name,batch,...line})=>line))}/>
 {dependent && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">This invoice has payments or returns. {canOverride ? <label className="ml-2 font-medium"><input type="checkbox" name="confirmDependentEdit" value="1" required/> I confirm this edit</label> : "Only an Owner or Admin can edit it."}</div>}
 {state?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
 <div className="grid gap-3 md:grid-cols-3"><select name="customerId" defaultValue={invoice.customerId} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="">Walk-in / Cash Sale</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><Input name="invoiceDate" type="date" defaultValue={invoice.invoiceDate}/><Input name="dueDate" type="date" defaultValue={invoice.dueDate}/><select name="paymentMode" defaultValue={invoice.paymentMode} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">{["CASH","BANK","CHEQUE","CREDIT"].map(x=><option key={x}>{x}</option>)}</select><Input name="paidAmount" type="number" step="0.01" defaultValue={invoice.paidAmount}/><Input name="discountAmount" type="number" step="0.01" defaultValue={invoice.discountAmount}/><Input name="notes" defaultValue={invoice.notes} className="md:col-span-3"/></div>
 <div className="rounded-xl border border-slate-200"><table className="w-full text-sm"><thead><tr className="bg-slate-50"><th className="p-3 text-left">Product / batch</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Disc%</th></tr></thead><tbody>{invoice.lines.map(l=><tr key={l.batchId} className="border-t"><td className="p-3">{l.name}<span className="ml-2 text-xs text-slate-500">{l.batch}</span></td><td className="p-3 text-right">{l.quantity}</td><td className="p-3 text-right">{l.salePrice}</td><td className="p-3 text-right">{l.discount}</td></tr>)}</tbody></table></div>
 <Button type="submit" disabled={pending || (dependent && !canOverride)} loading={pending}>Save Invoice Changes</Button></form>
}

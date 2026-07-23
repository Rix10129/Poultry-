/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { PDCForm } from "@/components/accounts/pdc-form"
interface Props { params: Promise<{ id: string }> }
export default async function EditPDCPage({ params }: Props) {
 const { id } = await params; const session = await getServerSession(authOptions); if (!session) redirect("/login")
 const user = session.user as any; if (user.role !== "OWNER" && user.role !== "ADMIN") redirect(`/accounts/pdc/${id}`)
 const [cheque, customers, suppliers] = await Promise.all([db.pDCCheque.findFirst({ where: { id, companyId: user.companyId } }), db.customer.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }), db.supplier.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } })])
 if (!cheque) notFound()
 return <div className="max-w-2xl mx-auto space-y-6"><div className="flex items-center gap-3"><Link href={`/accounts/pdc/${id}`} className="text-slate-400 hover:text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-bold text-slate-900">Edit PDC Cheque</h1><p className="text-sm text-slate-500">{cheque.chequeNumber}</p></div></div><div className="rounded-xl border border-slate-200 bg-white p-6"><PDCForm customers={customers} suppliers={suppliers} mode="edit" initialValues={{ id: cheque.id, type: cheque.type, customerId: cheque.customerId ?? "", supplierId: cheque.supplierId ?? "", chequeNumber: cheque.chequeNumber, bankName: cheque.bankName ?? "", chequeDate: cheque.chequeDate.toISOString().slice(0,10), amount: cheque.amount.toString(), notes: cheque.notes ?? "" }} /></div></div>
}

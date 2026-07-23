/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { VoucherForm } from "@/components/accounts/voucher-form"
interface Props { params: Promise<{ id: string }> }
export default async function EditVoucherPage({ params }: Props) {
 const { id } = await params; const session = await getServerSession(authOptions); if (!session) redirect("/login")
 const user = session.user as any; if (user.role !== "OWNER" && user.role !== "ADMIN") redirect(`/accounts/vouchers/${id}`)
 const [entry, accounts] = await Promise.all([db.journalEntry.findFirst({ where: { id, companyId: user.companyId }, include: { lines: true } }), db.account.findMany({ where: { companyId: user.companyId }, orderBy: [{ type: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, type: true } })])
 if (!entry) notFound()
 return <div className="max-w-5xl mx-auto space-y-6"><div className="flex items-center gap-3"><Link href={`/accounts/vouchers/${id}`} className="text-slate-400 hover:text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-bold text-slate-900">Edit Voucher</h1><p className="text-sm text-slate-500">{entry.voucherNumber}</p></div></div><div className="rounded-xl border border-slate-200 bg-white p-6"><VoucherForm accounts={accounts} mode="edit" initialValues={{ id: entry.id, voucherType: entry.voucherType, entryDate: entry.entryDate.toISOString().slice(0,10), description: entry.description, reference: entry.reference ?? "", lines: entry.lines.map(l => ({ key: l.id, debitAccountId: l.debitAccountId ?? "", creditAccountId: l.creditAccountId ?? "", amount: Number(l.amount), description: l.description ?? "" })) }} /></div></div>
}

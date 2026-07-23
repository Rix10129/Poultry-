/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { UserForm } from "@/components/users/user-form"
interface Props { params: Promise<{ id: string }> }
const ROLE_HIERARCHY: Record<string, any[]> = { OWNER: ["OWNER", "ADMIN", "CASHIER", "SALESMAN"], ADMIN: ["CASHIER", "SALESMAN"] }
export default async function EditUserPage({ params }: Props) {
 const { id } = await params; const session = await getServerSession(authOptions); if (!session) redirect("/login")
 const actor = session.user as any; if (actor.role !== "OWNER" && actor.role !== "ADMIN") redirect(`/users/${id}`)
 const user = await db.user.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true, name: true, email: true, phone: true, role: true } })
 if (!user) notFound()
 return <div className="max-w-2xl mx-auto space-y-6"><div className="flex items-center gap-3"><Link href={`/users/${id}`} className="text-slate-400 hover:text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-bold text-slate-900">Edit User</h1><p className="text-sm text-slate-500">{user.email}</p></div></div><div className="rounded-xl border border-slate-200 bg-white p-6"><UserForm user={user} allowedRoles={ROLE_HIERARCHY[actor.role] ?? []} /></div></div>
}

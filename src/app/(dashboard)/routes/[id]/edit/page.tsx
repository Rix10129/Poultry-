/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { RouteForm } from "@/components/routes/route-form"

interface Props { params: Promise<{ id: string }> }

export default async function EditRoutePage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string
  const [route, salesmen] = await Promise.all([
    db.route.findFirst({ where: { id, companyId } }),
    db.user.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])
  if (!route) notFound()
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3"><Link href={`/routes/${id}`} className="text-slate-400 hover:text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-bold text-slate-900">Edit Route</h1><p className="text-sm text-slate-500">{route.name}</p></div></div>
      <div className="bg-white rounded-xl border border-slate-200 p-6"><RouteForm salesmen={salesmen} defaultValues={{ id: route.id, name: route.name, description: route.description, salesmanId: route.salesmanId }} /></div>
    </div>
  )
}

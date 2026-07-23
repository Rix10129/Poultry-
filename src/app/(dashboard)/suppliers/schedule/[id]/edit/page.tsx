/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ScheduleForm } from "@/components/suppliers/schedule-form"

interface Props { params: Promise<{ id: string }> }

export default async function EditSupplierSchedulePage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const user = session.user as any
  if (user.role !== "OWNER" && user.role !== "ADMIN") redirect("/suppliers/schedule")

  const [schedule, suppliers] = await Promise.all([
    db.supplierPaymentSchedule.findFirst({ where: { id, companyId: user.companyId } }),
    db.supplier.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])
  if (!schedule) notFound()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/suppliers/schedule" className="text-slate-400 hover:text-slate-600"><ChevronLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-xl font-bold text-slate-900">Edit Payment Schedule</h1><p className="text-sm text-slate-500">{schedule.description}</p></div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <ScheduleForm suppliers={suppliers} mode="edit" initialValues={{ id: schedule.id, supplierId: schedule.supplierId, description: schedule.description, dueDate: schedule.dueDate.toISOString().slice(0, 10), amount: schedule.amount.toString(), notes: schedule.notes }} />
      </div>
    </div>
  )
}

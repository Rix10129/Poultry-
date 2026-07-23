/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ExpenseForm } from "@/components/expenses/expense-form"

interface Props { params: Promise<{ id: string }> }

export default async function EditExpensePage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const user = session.user as any
  if (user.role !== "OWNER" && user.role !== "ADMIN") redirect(`/expenses/${id}`)

  const expense = await db.expense.findFirst({ where: { id, companyId: user.companyId } })
  if (!expense) notFound()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/expenses/${id}`} className="text-slate-400 hover:text-slate-600"><ChevronLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-xl font-bold text-slate-900">Edit Expense</h1><p className="text-sm text-slate-500">{expense.description}</p></div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <ExpenseForm mode="edit" initialValues={{ id: expense.id, expenseDate: expense.expenseDate.toISOString().slice(0, 10), category: expense.category, description: expense.description, amount: expense.amount.toString(), paymentMode: expense.paymentMode, reference: expense.reference, notes: expense.notes }} />
      </div>
    </div>
  )
}

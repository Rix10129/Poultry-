import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ExpenseForm } from "@/components/expenses/expense-form"

export const metadata = { title: "New Expense" }

export default async function NewExpensePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/expenses" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Record Expense</h1>
          <p className="text-sm text-slate-500">Log a business expense</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <ExpenseForm />
      </div>
    </div>
  )
}

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteExpense } from "@/app/(dashboard)/expenses/actions"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"

const CATEGORY_LABELS: Record<string, string> = {
  FUEL:         "Fuel / Petrol",
  VEHICLE:      "Vehicle Maintenance",
  SALARY:       "Salary & Wages",
  RENT:         "Rent",
  UTILITIES:    "Utilities",
  OFFICE:       "Office Supplies",
  MARKETING:    "Marketing & Samples",
  BANK_CHARGES: "Bank Charges",
  OTHER:        "Other",
}

const MODE_LABELS: Record<string, string> = {
  CASH:   "Cash",
  BANK:   "Bank Transfer",
  CHEQUE: "Cheque",
  CREDIT: "Credit",
}

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const e = await db.expense.findUnique({ where: { id }, select: { description: true } })
  return { title: e?.description ?? "Expense" }
}

export default async function ExpenseDetailPage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const expense = await db.expense.findFirst({
    where: { id, companyId },
    include: { user: { select: { name: true } } },
  })
  if (!expense) notFound()

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/expenses" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{expense.description}</h1>
          <p className="text-sm text-slate-500">
            {expense.expenseDate.toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Category</p>
            <p className="text-slate-800 font-medium">{CATEGORY_LABELS[expense.category] ?? expense.category}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Amount</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(parseFloat(expense.amount.toString()))}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Payment Mode</p>
            <p className="text-slate-800">{MODE_LABELS[expense.paymentMode] ?? expense.paymentMode}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Recorded By</p>
            <p className="text-slate-800">{expense.user.name}</p>
          </div>
          {expense.reference && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Reference</p>
              <p className="text-slate-800 font-mono text-sm">{expense.reference}</p>
            </div>
          )}
          {expense.notes && (
            <div className="col-span-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-slate-700">{expense.notes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-5">
        <p className="text-sm text-slate-500 mb-3">Remove this expense record permanently.</p>
        <DeleteButton
          action={deleteExpense}
          id={expense.id}
          label="Delete Expense"
          confirmMessage="Delete this expense? This cannot be undone."
        />
      </div>
    </div>
  )
}

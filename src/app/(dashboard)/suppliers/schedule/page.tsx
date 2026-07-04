import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Calendar, CheckCircle2, AlertCircle } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { DeleteButton } from "@/components/ui/delete-button"
import { MarkPaidButton } from "@/components/suppliers/mark-paid-button"
import { deletePaymentSchedule } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Payment Schedule" }

export default async function SupplierSchedulePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const schedules = await db.supplierPaymentSchedule.findMany({
    where: { companyId },
    orderBy: [{ isPaid: "asc" }, { dueDate: "asc" }],
    include: {
      supplier: { select: { name: true } },
      purchaseOrder: { select: { poNumber: true } },
    },
  })

  const unpaid = schedules.filter((s) => !s.isPaid)
  const paid = schedules.filter((s) => s.isPaid)
  const overdueCount = unpaid.filter((s) => s.dueDate < today).length
  const totalOwed = unpaid.reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Schedule</h1>
          <p className="text-slate-500 text-sm mt-0.5">Upcoming supplier payables</p>
        </div>
        <Link
          href="/suppliers/schedule/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Schedule
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Owed</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(totalOwed)}</p>
          <p className="text-xs text-slate-400 mt-1">{unpaid.length} pending</p>
        </div>
        <div className={`rounded-xl border p-4 ${overdueCount > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-medium uppercase tracking-wider ${overdueCount > 0 ? "text-red-600" : "text-slate-500"}`}>Overdue</p>
          <p className={`mt-1 text-2xl font-bold ${overdueCount > 0 ? "text-red-700" : "text-slate-900"}`}>{overdueCount}</p>
          <p className={`text-xs mt-1 ${overdueCount > 0 ? "text-red-500" : "text-slate-400"}`}>past due date</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Paid This Year</p>
          <p className="mt-1 text-2xl font-bold text-green-700">
            {formatCurrency(paid.reduce((s, p) => s + parseFloat(p.amount.toString()), 0))}
          </p>
          <p className="text-xs text-slate-400 mt-1">{paid.length} completed</p>
        </div>
      </div>

      {/* Pending */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-900">Pending Payments</h2>
        </div>
        {unpaid.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">All payments are up to date</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Supplier</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Description</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Due Date</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Amount</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {unpaid.map((s) => {
                const isOverdue = s.dueDate < today
                return (
                  <tr key={s.id} className={`hover:bg-slate-50 ${isOverdue ? "bg-red-50/40" : ""}`}>
                    <td className="px-5 py-3">
                      <Link href={`/suppliers/${s.supplierId}`} className="font-semibold text-blue-600 hover:text-blue-700">
                        {s.supplier.name}
                      </Link>
                      {s.purchaseOrder && (
                        <p className="text-xs text-slate-400">PO: {s.purchaseOrder.poNumber}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {s.description}
                      {s.notes && <p className="text-xs text-slate-400 mt-0.5">{s.notes}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={isOverdue ? "text-red-600 font-semibold" : "text-slate-600"}>
                        {formatDate(s.dueDate)}
                      </span>
                      {isOverdue && <span className="ml-1 text-xs text-red-500">OVERDUE</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(parseFloat(s.amount.toString()))}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <MarkPaidButton id={s.id} />
                        <DeleteButton
                          action={deletePaymentSchedule}
                          id={s.id}
                          label="Delete"
                          confirmMessage={`Delete this payment schedule?`}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paid history */}
      {paid.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <h2 className="text-sm font-semibold text-slate-900">Paid</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Supplier</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Description</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Paid On</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Amount</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paid.slice(0, 20).map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 opacity-70">
                  <td className="px-5 py-3 font-medium text-slate-700">{s.supplier.name}</td>
                  <td className="px-5 py-3 text-slate-600">{s.description}</td>
                  <td className="px-5 py-3 text-slate-500">{s.paidAt ? formatDate(s.paidAt) : "—"}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{formatCurrency(parseFloat(s.amount.toString()))}</td>
                  <td className="px-5 py-3">
                    <DeleteButton
                      action={deletePaymentSchedule}
                      id={s.id}
                      label="Delete"
                      confirmMessage={`Delete this payment record?`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

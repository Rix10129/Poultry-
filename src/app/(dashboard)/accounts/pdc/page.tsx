import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, CreditCard, AlertTriangle, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "PDC Register" }

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function PDCPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { status } = await searchParams
  const filterStatus = status === "DEPOSITED" ? "DEPOSITED" : status === "BOUNCED" ? "BOUNCED" : status === "PENDING" ? "PENDING" : undefined

  const cheques = await db.pDCCheque.findMany({
    where: { companyId, ...(filterStatus ? { status: filterStatus } : {}) },
    include: {
      customer: { select: { name: true } },
      supplier: { select: { name: true } },
    },
    orderBy: { chequeDate: "asc" },
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const threeDaysLater = new Date(today.getTime() + 3 * 86400_000)

  const totalPending = cheques
    .filter((c) => c.status === "PENDING" && c.type === "RECEIVABLE")
    .reduce((s, c) => s + parseFloat(c.amount.toString()), 0)

  const dueSoon = cheques.filter(
    (c) => c.status === "PENDING" && c.chequeDate <= threeDaysLater
  ).length

  const STATUS_TABS = [
    { label: "All", value: "" },
    { label: "Pending", value: "PENDING" },
    { label: "Deposited", value: "DEPOSITED" },
    { label: "Bounced", value: "BOUNCED" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">PDC Register</h1>
          <p className="text-sm text-slate-500 mt-0.5">Post-dated cheques — receivable from customers &amp; payable to suppliers</p>
        </div>
        <Link href="/accounts/pdc/new">
          <Button>
            <Plus className="h-4 w-4" />
            Add Cheque
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <CreditCard className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Pending Receivable</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(totalPending)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Due in Next 3 Days</p>
            <p className="text-lg font-bold text-slate-900">{dueSoon} cheque{dueSoon !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
            <CreditCard className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Cheques</p>
            <p className="text-lg font-bold text-slate-900">{cheques.length}</p>
          </div>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value ? `/accounts/pdc?status=${tab.value}` : "/accounts/pdc"}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              (filterStatus ?? "") === tab.value
                ? "bg-white border border-b-white border-slate-200 text-slate-900 -mb-px"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {cheques.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CreditCard className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No cheques found</p>
          <p className="text-sm text-slate-400 mt-1">Add cheques received from customers or given to suppliers</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Cheque #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Party</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Bank</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Cheque Date</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cheques.map((c) => {
                const isDueSoon = c.status === "PENDING" && c.chequeDate <= threeDaysLater
                const isOverdue = c.status === "PENDING" && c.chequeDate < today
                const partyName = c.customer?.name ?? c.supplier?.name ?? "—"

                return (
                  <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${isOverdue ? "bg-red-50" : isDueSoon ? "bg-amber-50" : ""}`}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/accounts/pdc/${c.id}`}
                        className="font-mono font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {c.chequeNumber}
                      </Link>
                      <Link href={`/accounts/pdc/${c.id}/edit`} className="ml-2 text-xs text-slate-500 hover:text-blue-600">Edit</Link>
                      {isOverdue && <AlertTriangle className="inline ml-1 h-3 w-3 text-red-500" />}
                      {isDueSoon && !isOverdue && <Clock className="inline ml-1 h-3 w-3 text-amber-500" />}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{partyName}</td>
                    <td className="px-4 py-3 text-slate-500">{c.bankName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(c.chequeDate)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(parseFloat(c.amount.toString()))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.type === "RECEIVABLE"
                          ? "bg-green-100 text-green-700"
                          : "bg-purple-100 text-purple-700"
                      }`}>
                        {c.type === "RECEIVABLE" ? "Receivable" : "Payable"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.status === "PENDING" ? (
                        <Badge variant="warning">Pending</Badge>
                      ) : c.status === "DEPOSITED" ? (
                        <Badge variant="success">Deposited</Badge>
                      ) : (
                        <Badge variant="danger">Bounced</Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

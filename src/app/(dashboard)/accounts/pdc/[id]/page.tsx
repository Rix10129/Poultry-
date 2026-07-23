import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { PDCStatusForm } from "@/components/accounts/pdc-status-form"
import { DeleteButton } from "@/components/ui/delete-button"
import { Button } from "@/components/ui/button"
import { deletePDC } from "@/app/(dashboard)/accounts/pdc/actions"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const c = await db.pDCCheque.findUnique({ where: { id }, select: { chequeNumber: true } })
  return { title: c?.chequeNumber ?? "PDC Cheque" }
}

export default async function PDCDetailPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const cheque = await db.pDCCheque.findFirst({
    where: { id, companyId },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      supplier: { select: { id: true, name: true, phone: true } },
    },
  })

  if (!cheque) notFound()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isDue = cheque.status === "PENDING" && cheque.chequeDate <= today

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/accounts/pdc" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-mono">{cheque.chequeNumber}</h1>
            <p className="text-sm text-slate-500">{formatDate(cheque.chequeDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cheque.status === "PENDING" ? (
            <Badge variant="warning">Pending</Badge>
          ) : cheque.status === "DEPOSITED" ? (
            <Badge variant="success">Deposited</Badge>
          ) : (
            <Badge variant="danger">Bounced</Badge>
          )}
        </div>
      </div>

      {isDue && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          This cheque is due for deposit today or is overdue. Update its status below.
        </div>
      )}

      {/* Detail card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Type</p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
              cheque.type === "RECEIVABLE"
                ? "bg-green-100 text-green-700"
                : "bg-purple-100 text-purple-700"
            }`}>
              {cheque.type === "RECEIVABLE" ? "Receivable from Customer" : "Payable to Supplier"}
            </span>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Amount</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(parseFloat(cheque.amount.toString()))}</p>
          </div>

          {cheque.customer && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Customer</p>
              <Link href={`/customers/${cheque.customer.id}`} className="text-blue-600 hover:text-blue-700 font-semibold">
                {cheque.customer.name}
              </Link>
              {cheque.customer.phone && <p className="text-slate-500 text-xs mt-0.5">{cheque.customer.phone}</p>}
            </div>
          )}
          {cheque.supplier && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Supplier</p>
              <Link href={`/suppliers/${cheque.supplier.id}`} className="text-blue-600 hover:text-blue-700 font-semibold">
                {cheque.supplier.name}
              </Link>
              {cheque.supplier.phone && <p className="text-slate-500 text-xs mt-0.5">{cheque.supplier.phone}</p>}
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Bank</p>
            <p className="text-slate-800">{cheque.bankName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Cheque Date</p>
            <p className="text-slate-800">{formatDate(cheque.chequeDate)}</p>
          </div>
          {cheque.depositedAt && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Deposited On</p>
              <p className="text-slate-800">{formatDate(cheque.depositedAt)}</p>
            </div>
          )}
          {cheque.notes && (
            <div className="col-span-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-slate-800">{cheque.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Update status */}
      {cheque.status === "PENDING" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Update Status</h2>
          <PDCStatusForm id={cheque.id} />
        </div>
      )}

      {/* Delete */}
      <div className="bg-white rounded-xl border border-red-200 p-5">
        <p className="text-sm text-slate-500 mb-3">Remove this cheque record permanently.</p>
        <Link href={`/accounts/pdc/${id}/edit`}><Button size="sm" variant="outline">Edit</Button></Link>
        <DeleteButton
          action={deletePDC}
          id={cheque.id}
          label="Delete Cheque"
          confirmMessage="Delete this cheque record? This cannot be undone."
        />
      </div>
    </div>
  )
}

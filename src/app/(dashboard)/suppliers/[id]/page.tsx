import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const s = await db.supplier.findUnique({ where: { id }, select: { name: true } })
  return { title: s?.name ?? "Supplier" }
}

export default async function SupplierDetailPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const supplier = await db.supplier.findFirst({
    where: { id, companyId },
    include: {
      purchases: {
        orderBy: { orderDate: "desc" },
        take: 50,
        select: {
          id: true,
          poNumber: true,
          orderDate: true,
          netAmount: true,
          paidAmount: true,
        },
      },
    },
  })

  if (!supplier) notFound()

  const totalNet = supplier.purchases.reduce(
    (s, p) => s + parseFloat(p.netAmount.toString()),
    0
  )
  const totalPaid = supplier.purchases.reduce(
    (s, p) => s + parseFloat(p.paidAmount.toString()),
    0
  )
  const outstanding = parseFloat(supplier.openingBalance.toString()) + totalNet - totalPaid

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/suppliers" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{supplier.name}</h1>
            <p className="text-sm text-slate-500">
              {supplier.purchases.length} purchase order{supplier.purchases.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/purchases/new?supplierId=${supplier.id}`}>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New Purchase
            </Button>
          </Link>
          <Link href={`/suppliers/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* Info + balance cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Contact Details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-slate-500">Phone</dt>
            <dd className="text-slate-800">{supplier.phone ?? "—"}</dd>
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-800">{supplier.email ?? "—"}</dd>
            <dt className="text-slate-500">Address</dt>
            <dd className="text-slate-800">{supplier.address ?? "—"}</dd>
            <dt className="text-slate-500">Tax / NTN</dt>
            <dd className="text-slate-800">{supplier.taxNumber ?? "—"}</dd>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Account Summary</h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Opening Balance</span>
              <span>{formatCurrency(parseFloat(supplier.openingBalance.toString()))}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Total Purchases</span>
              <span>{formatCurrency(totalNet)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Total Paid</span>
              <span>{formatCurrency(totalPaid)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between font-semibold">
              <span className="text-slate-900">Outstanding</span>
              <span className={outstanding > 0.001 ? "text-red-600" : "text-green-600"}>
                {outstanding > 0.001 ? formatCurrency(outstanding) : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Purchase history */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-900">Purchase Orders</h2>
        </div>
        {supplier.purchases.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-400">No purchase orders yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">PO #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Net Amount</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Paid</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supplier.purchases.map((po) => {
                const net = parseFloat(po.netAmount.toString())
                const paid = parseFloat(po.paidAmount.toString())
                const bal = net - paid
                const isPaid = bal <= 0.001
                const isPartial = !isPaid && paid > 0.001
                return (
                  <tr key={po.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/purchases/${po.id}`}
                        className="font-mono font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {po.poNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(po.orderDate)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(net)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatCurrency(paid)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isPaid ? (
                        <span className="text-green-600">—</span>
                      ) : (
                        <span className="font-semibold text-red-600">{formatCurrency(bal)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isPaid ? (
                        <Badge variant="success">Paid</Badge>
                      ) : isPartial ? (
                        <Badge variant="warning">Partial</Badge>
                      ) : (
                        <Badge variant="danger">Unpaid</Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

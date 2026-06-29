import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ExpiryBadge } from "@/components/inventory/expiry-badge"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const r = await db.saleReturn.findUnique({ where: { id }, select: { returnNumber: true } })
  return { title: r?.returnNumber ?? "Sale Return" }
}

export default async function SaleReturnDetailPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const ret = await db.saleReturn.findFirst({
    where: { id, companyId },
    include: {
      customer: { select: { name: true, phone: true } },
      invoice: { select: { invoiceNumber: true, id: true } },
      items: {
        include: {
          product: { select: { name: true, unit: true } },
          batch: { select: { batchNumber: true, expiryDate: true } },
        },
      },
    },
  })

  if (!ret) notFound()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/sales/returns" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-mono">{ret.returnNumber}</h1>
            <p className="text-sm text-slate-500">{formatDate(ret.returnDate)}</p>
          </div>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          Sale Return
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Meta */}
        <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Customer</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {ret.customer?.name ?? <span className="italic text-slate-400">Walk-in</span>}
            </p>
            {ret.customer?.phone && (
              <p className="text-xs text-slate-500">{ret.customer.phone}</p>
            )}
          </div>
          {ret.invoice && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Against Invoice</p>
              <Link
                href={`/sales/${ret.invoice.id}`}
                className="mt-1 text-sm font-mono font-semibold text-blue-600 hover:text-blue-700 block"
              >
                {ret.invoice.invoiceNumber}
              </Link>
            </div>
          )}
          {ret.notes && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Notes</p>
              <p className="mt-1 text-sm text-slate-700">{ret.notes}</p>
            </div>
          )}
        </div>

        {/* Items */}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-slate-600">#</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Product / Batch</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Qty</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Price</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ret.items.map((item, idx) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-6 py-3 text-slate-400">{idx + 1}</td>
                <td className="px-6 py-3">
                  <p className="font-medium text-slate-900">{item.product.name}</p>
                  {item.batch && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {item.batch.batchNumber}
                      </span>
                      <ExpiryBadge expiryDate={item.batch.expiryDate.toISOString()} />
                    </div>
                  )}
                </td>
                <td className="px-6 py-3 text-right text-slate-700">
                  {item.quantity} {item.product.unit}
                </td>
                <td className="px-6 py-3 text-right text-slate-700">
                  {formatCurrency(parseFloat(item.salePrice.toString()))}
                </td>
                <td className="px-6 py-3 text-right font-semibold text-slate-900">
                  {formatCurrency(parseFloat(item.totalAmount.toString()))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div className="border-t border-slate-200 px-6 py-4">
          <div className="ml-auto w-56 flex justify-between font-bold text-base text-slate-900">
            <span>Total Returned</span>
            <span>{formatCurrency(parseFloat(ret.totalAmount.toString()))}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

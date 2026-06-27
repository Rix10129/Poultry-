import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ExpiryBadge } from "@/components/inventory/expiry-badge"
import { PrintButton } from "@/components/sales/print-button"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const po = await db.purchaseOrder.findUnique({ where: { id }, select: { poNumber: true } })
  return { title: po?.poNumber ?? "Purchase Order" }
}

export default async function PurchaseDetailPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const po = await db.purchaseOrder.findFirst({
    where: { id, companyId },
    include: {
      supplier: { select: { id: true, name: true, phone: true, address: true } },
      user: { select: { name: true } },
      items: {
        include: {
          product: { select: { name: true, unit: true } },
          batch: { select: { batchNumber: true, expiryDate: true, manufactureDate: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  })

  if (!po) notFound()

  const net = parseFloat(po.netAmount.toString())
  const paid = parseFloat(po.paidAmount.toString())
  const balance = net - paid
  const isPaid = balance <= 0.001
  const isPartial = !isPaid && paid > 0.001

  return (
    <div className="max-w-4xl mx-auto space-y-6 print:max-w-none print:space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/purchases" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-mono">{po.poNumber}</h1>
            <p className="text-sm text-slate-500">{formatDate(po.orderDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PrintButton />
          {isPaid ? (
            <Badge variant="success">Paid</Badge>
          ) : isPartial ? (
            <Badge variant="warning">Partial</Badge>
          ) : (
            <Badge variant="danger">Unpaid</Badge>
          )}
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:flex print:justify-between print:items-start">
        <div>
          <h1 className="text-2xl font-bold">PURCHASE ORDER</h1>
          <p className="text-lg font-mono font-semibold mt-1">{po.poNumber}</p>
        </div>
        <div className="text-right text-sm">
          <p>Date: {formatDate(po.orderDate)}</p>
          <p className="mt-1">Status: {isPaid ? "PAID" : isPartial ? "PARTIAL" : "UNPAID"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden print:border-none print:rounded-none">
        {/* Meta */}
        <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Supplier</p>
            <Link
              href={`/suppliers/${po.supplier.id}`}
              className="mt-1 text-sm font-semibold text-blue-600 hover:text-blue-700 block"
            >
              {po.supplier.name}
            </Link>
            {po.supplier.phone && (
              <p className="text-xs text-slate-500">{po.supplier.phone}</p>
            )}
            {po.supplier.address && (
              <p className="text-xs text-slate-500">{po.supplier.address}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Prepared By</p>
            <p className="mt-1 text-sm text-slate-900">{po.user?.name ?? "—"}</p>
          </div>
          {po.notes && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Notes</p>
              <p className="mt-1 text-sm text-slate-900">{po.notes}</p>
            </div>
          )}
        </div>

        {/* Items */}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-slate-600">#</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Product / Batch</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Expiry</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Qty</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Buy Price</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Disc%</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Tax%</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {po.items.map((item, idx) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-6 py-3 text-slate-400">{idx + 1}</td>
                <td className="px-6 py-3">
                  <p className="font-medium text-slate-900">{item.product.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {item.batch?.batchNumber ?? "—"}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-3">
                  {item.batch ? (
                    <ExpiryBadge expiryDate={item.batch.expiryDate.toISOString()} />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-6 py-3 text-right text-slate-700">
                  {item.quantity} {item.product.unit}
                </td>
                <td className="px-6 py-3 text-right text-slate-700">
                  {formatCurrency(parseFloat(item.purchasePrice.toString()))}
                </td>
                <td className="px-6 py-3 text-right text-slate-500">
                  {parseFloat(item.discount.toString()) > 0
                    ? `${parseFloat(item.discount.toString())}%`
                    : "—"}
                </td>
                <td className="px-6 py-3 text-right text-slate-500">
                  {parseFloat(item.taxRate.toString()) > 0
                    ? `${parseFloat(item.taxRate.toString())}%`
                    : "—"}
                </td>
                <td className="px-6 py-3 text-right font-semibold text-slate-900">
                  {formatCurrency(parseFloat(item.totalAmount.toString()))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="border-t border-slate-200 px-6 py-4">
          <div className="ml-auto w-64 space-y-2 text-sm">
            <TotalRow label="Subtotal" value={formatCurrency(parseFloat(po.totalAmount.toString()))} />
            {parseFloat(po.discountAmount.toString()) > 0.001 && (
              <TotalRow
                label="Discount"
                value={`− ${formatCurrency(parseFloat(po.discountAmount.toString()))}`}
              />
            )}
            {parseFloat(po.taxAmount.toString()) > 0.001 && (
              <TotalRow label="Tax" value={formatCurrency(parseFloat(po.taxAmount.toString()))} />
            )}
            <div className="border-t border-slate-200 pt-2">
              <TotalRow label="Net Amount" value={formatCurrency(net)} bold />
            </div>
            <TotalRow label="Amount Paid" value={formatCurrency(paid)} />
            <div
              className={`flex justify-between font-bold text-base pt-1 ${
                isPaid ? "text-green-600" : "text-red-600"
              }`}
            >
              <span>{isPaid ? "Settled ✓" : "Balance Due"}</span>
              <span>{Math.abs(balance) < 0.001 ? "—" : formatCurrency(Math.abs(balance))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

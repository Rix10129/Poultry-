import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { PrintButton } from "@/components/sales/print-button"
import { BrandingFooter } from "@/components/branding-footer"

export const dynamic = "force-dynamic"
export const metadata = { title: "Monthly Cash Receiving Statement — Product-wise" }

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function CashReceivingReportPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string
  const companyName = (session.user as any).companyName as string ?? "Our Company"

  const { from, to } = await searchParams
  const now = new Date()
  const fromDate = from ? new Date(from + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), 1)
  const toDate = to ? new Date(to + "T23:59:59") : now

  // Cash received comes from two places: (1) invoices paid in cash at the
  // time of sale, and (2) later cash collections against a specific
  // invoice. Neither records "cash per product" directly, so each cash
  // amount is allocated across its invoice's line items by their share of
  // that invoice's total — an approximation, not a ledger-grade figure.
  // Payments not tied to a specific invoice (general/on-account payments)
  // can't be attributed to any product and are called out separately.
  const [cashInvoices, cashPayments] = await Promise.all([
    db.saleInvoice.findMany({
      where: { companyId, status: "POSTED", paymentMode: "CASH", invoiceDate: { gte: fromDate, lte: toDate }, paidAmount: { gt: 0 } },
      select: { paidAmount: true, items: { select: { productId: true, totalAmount: true } } },
    }),
    db.customerPayment.findMany({
      where: { companyId, status: "POSTED", paymentMode: "CASH", paymentDate: { gte: fromDate, lte: toDate } },
      select: {
        amount: true,
        invoiceId: true,
        invoice: { select: { items: { select: { productId: true, totalAmount: true } } } },
      },
    }),
  ])

  const byProduct = new Map<string, number>()
  let unallocated = 0

  function allocate(items: { productId: string; totalAmount: unknown }[], cashAmount: number) {
    const sumItems = items.reduce((s, it) => s + Number(it.totalAmount), 0)
    if (sumItems <= 0) { unallocated += cashAmount; return }
    for (const item of items) {
      const share = (Number(item.totalAmount) / sumItems) * cashAmount
      byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + share)
    }
  }

  for (const inv of cashInvoices) allocate(inv.items, Number(inv.paidAmount))
  for (const payment of cashPayments) {
    if (payment.invoiceId && payment.invoice) allocate(payment.invoice.items, Number(payment.amount))
    else unallocated += Number(payment.amount)
  }

  const productIds = Array.from(byProduct.keys())
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, unit: true } })
    : []
  const productMap = new Map(products.map(p => [p.id, p]))

  const rows = Array.from(byProduct.entries())
    .map(([productId, amount]) => ({ name: productMap.get(productId)?.name ?? "Unknown product", amount }))
    .sort((a, b) => b.amount - a.amount)
  const total = rows.reduce((s, r) => s + r.amount, 0) + unallocated

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Monthly Cash Receiving Statement — Product-wise</h1>
            <p className="text-sm text-slate-500">Cash collected this period, allocated across the products it relates to</p>
          </div>
        </div>
        <PrintButton />
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 p-4 print:hidden">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input type="date" name="from" defaultValue={isoDate(fromDate)} className="block border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input type="date" name="to" defaultValue={isoDate(toDate)} className="block border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          Apply
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{companyName}</h2>
              <p className="text-sm text-slate-500 mt-0.5">Monthly Cash Receiving Statement — Product-wise</p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p><span className="font-medium">Period:</span> {formatDate(fromDate)} – {formatDate(toDate)}</p>
              <p><span className="font-medium">Printed:</span> {formatDate(new Date())}</p>
            </div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Product</th>
              <th className="text-right px-5 py-3 font-medium text-slate-600">Cash Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && unallocated === 0 && (
              <tr>
                <td colSpan={2} className="px-5 py-8 text-center text-slate-400">No cash received in this period</td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{row.name}</td>
                <td className="px-5 py-3 text-right font-mono text-green-700">{formatCurrency(row.amount)}</td>
              </tr>
            ))}
            {unallocated > 0.001 && (
              <tr className="bg-slate-50/60">
                <td className="px-5 py-3 text-slate-500 italic">General payments (not tied to a specific invoice)</td>
                <td className="px-5 py-3 text-right font-mono text-slate-500">{formatCurrency(unallocated)}</td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50">
            <tr>
              <td className="px-5 py-3 font-bold text-slate-900">Total Cash Received</td>
              <td className="px-5 py-3 text-right font-bold text-green-700">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="px-6 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Product amounts are allocated from each invoice&rsquo;s cash total by each product&rsquo;s share of that invoice — an approximation, not a per-line cash record.
          </p>
        </div>
        <BrandingFooter />
      </div>
    </div>
  )
}

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
export const metadata = { title: "Monthly Sales Statement — Customer-wise" }

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function SalesByCustomerPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string
  const companyName = (session.user as any).companyName as string ?? "Our Company"

  const { from, to } = await searchParams
  const now = new Date()
  const fromDate = from ? new Date(from + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), 1)
  const toDate = to ? new Date(to + "T23:59:59") : now

  const invoices = await db.saleInvoice.findMany({
    where: { companyId, status: "POSTED", invoiceDate: { gte: fromDate, lte: toDate } },
    select: {
      customerId: true,
      netAmount: true,
      paidAmount: true,
      customer: { select: { name: true } },
    },
  })

  const byCustomer = new Map<string, { name: string; count: number; net: number; paid: number }>()
  for (const inv of invoices) {
    const key = inv.customerId ?? "__walk_in__"
    const name = inv.customer?.name ?? "Walk-in / Cash Memo"
    const entry = byCustomer.get(key) ?? { name, count: 0, net: 0, paid: 0 }
    entry.count += 1
    entry.net += Number(inv.netAmount)
    entry.paid += Number(inv.paidAmount)
    byCustomer.set(key, entry)
  }

  const rows = Array.from(byCustomer.values()).sort((a, b) => b.net - a.net)
  const totalNet = rows.reduce((s, r) => s + r.net, 0)
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Monthly Sales Statement — Customer-wise</h1>
            <p className="text-sm text-slate-500">Total sales per customer for the selected period</p>
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
              <p className="text-sm text-slate-500 mt-0.5">Monthly Sales Statement — Customer-wise</p>
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
              <th className="text-left px-5 py-3 font-medium text-slate-600">Customer</th>
              <th className="text-right px-5 py-3 font-medium text-slate-600">Invoices</th>
              <th className="text-right px-5 py-3 font-medium text-slate-600">Net Sales</th>
              <th className="text-right px-5 py-3 font-medium text-slate-600">Collected</th>
              <th className="text-right px-5 py-3 font-medium text-slate-600">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">No sales in this period</td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{row.name}</td>
                <td className="px-5 py-3 text-right text-slate-600">{row.count}</td>
                <td className="px-5 py-3 text-right font-mono text-slate-900">{formatCurrency(row.net)}</td>
                <td className="px-5 py-3 text-right font-mono text-green-700">{formatCurrency(row.paid)}</td>
                <td className="px-5 py-3 text-right font-mono text-orange-600">{formatCurrency(row.net - row.paid)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50">
            <tr>
              <td colSpan={2} className="px-5 py-3 font-bold text-slate-900">Totals</td>
              <td className="px-5 py-3 text-right font-bold text-slate-900">{formatCurrency(totalNet)}</td>
              <td className="px-5 py-3 text-right font-bold text-green-700">{formatCurrency(totalPaid)}</td>
              <td className="px-5 py-3 text-right font-bold text-orange-600">{formatCurrency(totalNet - totalPaid)}</td>
            </tr>
          </tfoot>
        </table>
        <BrandingFooter />
      </div>
    </div>
  )
}

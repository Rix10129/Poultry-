import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { WhatsAppCopyButton } from "@/components/reports/whatsapp-copy-button"

export const dynamic = "force-dynamic"
export const metadata = { title: "Aging Report" }

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400_000)
}

function ageBucket(days: number): "b0_30" | "b31_60" | "b61_90" | "b90plus" {
  if (days <= 30) return "b0_30"
  if (days <= 60) return "b31_60"
  if (days <= 90) return "b61_90"
  return "b90plus"
}

export default async function AgingReportPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string
  const companyName = (session.user as any).companyName as string ?? "Your Company"

  const today = new Date()
  today.setHours(23, 59, 59, 999)

  // Fetch all invoices with outstanding balance
  const invoices = await db.saleInvoice.findMany({
    where: {
      companyId,
      customer: { isNot: null },
    },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      netAmount: true,
      paidAmount: true,
      customer: { select: { id: true, name: true, area: true } },
    },
    orderBy: { invoiceDate: "asc" },
  })

  // Group by customer and bucket outstanding by age
  type CustomerRow = {
    id: string
    name: string
    area: string | null
    b0_30: number
    b31_60: number
    b61_90: number
    b90plus: number
    total: number
    invoiceCount: number
  }

  const customerMap = new Map<string, CustomerRow>()

  for (const inv of invoices) {
    if (!inv.customer) continue
    const balance = parseFloat(inv.netAmount.toString()) - parseFloat(inv.paidAmount.toString())
    if (balance < 0.01) continue

    const refDate = inv.dueDate ?? inv.invoiceDate
    const age = daysBetween(refDate, today)
    const bucket = ageBucket(age)

    const existing = customerMap.get(inv.customer.id)
    if (existing) {
      existing[bucket] += balance
      existing.total += balance
      existing.invoiceCount++
    } else {
      customerMap.set(inv.customer.id, {
        id: inv.customer.id,
        name: inv.customer.name,
        area: inv.customer.area,
        b0_30: 0,
        b31_60: 0,
        b61_90: 0,
        b90plus: 0,
        total: balance,
        invoiceCount: 1,
        [bucket]: balance,
      } as CustomerRow)
    }
  }

  const rows = Array.from(customerMap.values()).sort((a, b) => b.total - a.total)

  const grandTotal = {
    b0_30: rows.reduce((s, r) => s + r.b0_30, 0),
    b31_60: rows.reduce((s, r) => s + r.b31_60, 0),
    b61_90: rows.reduce((s, r) => s + r.b61_90, 0),
    b90plus: rows.reduce((s, r) => s + r.b90plus, 0),
    total: rows.reduce((s, r) => s + r.total, 0),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Aging Report</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Outstanding receivables by age — as of today
          </p>
        </div>
      </div>

      {/* Summary boxes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "0–30 Days", value: grandTotal.b0_30, color: "border-green-200 bg-green-50 text-green-700" },
          { label: "31–60 Days", value: grandTotal.b31_60, color: "border-yellow-200 bg-yellow-50 text-yellow-700" },
          { label: "61–90 Days", value: grandTotal.b61_90, color: "border-orange-200 bg-orange-50 text-orange-700" },
          { label: "90+ Days", value: grandTotal.b90plus, color: "border-red-200 bg-red-50 text-red-700" },
        ].map((b) => (
          <div key={b.label} className={`rounded-xl border p-4 ${b.color}`}>
            <p className="text-xs font-medium opacity-70">{b.label}</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(b.value)}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="font-medium text-slate-600">No outstanding receivables</p>
          <p className="text-sm text-slate-400 mt-1">All customer invoices are fully paid</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Area</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Inv.</th>
                <th className="text-right px-4 py-3 font-medium text-green-700 bg-green-50">0–30 Days</th>
                <th className="text-right px-4 py-3 font-medium text-yellow-700 bg-yellow-50">31–60 Days</th>
                <th className="text-right px-4 py-3 font-medium text-orange-700 bg-orange-50">61–90 Days</th>
                <th className="text-right px-4 py-3 font-medium text-red-700 bg-red-50">90+ Days</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-900">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${row.id}`} className="font-semibold text-blue-600 hover:text-blue-700">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{row.area ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{row.invoiceCount}</td>
                  <td className="px-4 py-3 text-right bg-green-50/50">
                    {row.b0_30 > 0.01 ? (
                      <span className="text-green-700">{formatCurrency(row.b0_30)}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right bg-yellow-50/50">
                    {row.b31_60 > 0.01 ? (
                      <span className="text-yellow-700 font-medium">{formatCurrency(row.b31_60)}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right bg-orange-50/50">
                    {row.b61_90 > 0.01 ? (
                      <span className="text-orange-700 font-semibold">{formatCurrency(row.b61_90)}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right bg-red-50/50">
                    {row.b90plus > 0.01 ? (
                      <span className="text-red-700 font-semibold">{formatCurrency(row.b90plus)}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {formatCurrency(row.total)}
                  </td>
                  <td className="px-4 py-3">
                    <WhatsAppCopyButton
                      customerName={row.name}
                      amount={row.total.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      companyName={companyName}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 font-bold text-slate-900">Grand Total</td>
                <td className="px-4 py-3 text-right font-bold text-green-700 bg-green-50">{formatCurrency(grandTotal.b0_30)}</td>
                <td className="px-4 py-3 text-right font-bold text-yellow-700 bg-yellow-50">{formatCurrency(grandTotal.b31_60)}</td>
                <td className="px-4 py-3 text-right font-bold text-orange-700 bg-orange-50">{formatCurrency(grandTotal.b61_90)}</td>
                <td className="px-4 py-3 text-right font-bold text-red-700 bg-red-50">{formatCurrency(grandTotal.b90plus)}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900 text-base">{formatCurrency(grandTotal.total)}</td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Age is calculated from due date (if set) or invoice date. Fully paid invoices are excluded.
      </p>
    </div>
  )
}

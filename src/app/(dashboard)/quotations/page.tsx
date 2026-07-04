import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, FileText, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Quotations" }

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  DRAFT: "default",
  SENT: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "warning",
}

export default async function QuotationsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const quotations = await db.quotation.findMany({
    where: { companyId },
    orderBy: { quoteDate: "desc" },
    take: 100,
    include: {
      customer: { select: { name: true } },
    },
  })

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
          <p className="text-slate-500 text-sm mt-0.5">Price quotes and estimates for customers</p>
        </div>
        <Link
          href="/quotations/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Quote
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {quotations.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-8 w-8 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No quotations yet</p>
            <Link href="/quotations/new" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
              Create your first quote →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Quote #</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Customer</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Date</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Valid Until</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Amount</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {quotations.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/quotations/${q.id}`} className="font-mono font-semibold text-blue-600 hover:text-blue-700 text-xs">
                      {q.quoteNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {q.customer?.name ?? <span className="italic text-slate-400">Walk-in</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{formatDate(q.quoteDate)}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {q.validUntil ? formatDate(q.validUntil) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(parseFloat(q.netAmount.toString()))}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_VARIANT[q.status] ?? "default"}>
                      {q.status.charAt(0) + q.status.slice(1).toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/quotations/${q.id}`}>
                      <ArrowRight className="h-4 w-4 text-slate-300 hover:text-slate-500" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, FileText, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Pagination } from "@/components/ui/pagination"

export const metadata = { title: "Sales" }

const PAGE_SIZE = 50

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { q, page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? "1") || 1)

  const where = {
    companyId,
    ...(q ? { invoiceNumber: { contains: q, mode: "insensitive" as const } } : {}),
  }

  const [invoices, total] = await Promise.all([
    db.saleInvoice.findMany({
      where,
      include: { customer: { select: { name: true } } },
      orderBy: { invoiceDate: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.saleInvoice.count({ where }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} invoice{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/sales/returns">
            <Button variant="outline">
              <RotateCcw className="h-4 w-4" />
              Returns
            </Button>
          </Link>
          <Link href="/sales/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      <form method="GET" className="flex gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by invoice number…"
          className="h-9 w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button type="submit" variant="outline" size="sm">Search</Button>
        {q && (
          <Link href="/sales">
            <Button variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No invoices yet</p>
          <p className="text-sm text-slate-400 mt-1">Create your first sale invoice to get started</p>
          <Link href="/sales/new" className="mt-4">
            <Button><Plus className="h-4 w-4" />New Invoice</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Mode</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Net Amount</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Paid</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const net = parseFloat(inv.netAmount.toString())
                const paid = parseFloat(inv.paidAmount.toString())
                const bal = net - paid
                const isPaid = bal <= 0.001
                const isPartial = !isPaid && paid > 0.001

                return (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/sales/${inv.id}`}
                        className="font-mono font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {inv.customer?.name ?? (
                        <span className="text-slate-400 italic">Walk-in</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">
                      {inv.paymentMode.toLowerCase().replace("_", " ")}
                    </td>
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
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            baseUrl={q ? `/sales?q=${encodeURIComponent(q)}` : "/sales"}
          />
        </div>
      )}
    </div>
  )
}

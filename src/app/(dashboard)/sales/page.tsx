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
import { ExportButtons } from "@/components/reports/export-buttons"
import { matchesPaymentStatus, parseTransactionFilters, transactionWhere } from "@/lib/report-filters"

export const metadata = { title: "Sales" }

const PAGE_SIZE = 50

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const raw = await searchParams
  const parsed = parseTransactionFilters(raw)
  const filters = parsed.success ? parsed.data : parseTransactionFilters({}).data!
  const { q, from, to, paymentMode, partyId, userId, paymentStatus, status } = filters
  const page = Math.max(1, parseInt(raw.page ?? "1") || 1)
  const where = transactionWhere(filters, companyId, "sales")
  const [customers, users] = await Promise.all([
    db.customer.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  const [invoices, total] = await Promise.all([
    db.saleInvoice.findMany({
      where: where as never,
      include: { customer: { select: { name: true } } },
      orderBy: { invoiceDate: "desc" },
      ...(paymentStatus === "PAID" || paymentStatus === "PARTIAL" ? {} : { take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    }),
    db.saleInvoice.count({ where: where as never }),
  ])
  const visibleInvoices = invoices.filter(inv => matchesPaymentStatus(inv, paymentStatus))
  const queryParams = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)]))

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

      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Invoice number or customer…"
          className="h-9 w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input name="from" type="date" defaultValue={from} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700" />
        <input name="to" type="date" defaultValue={to} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700" />
        <select name="paymentMode" defaultValue={paymentMode ?? ""} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
          <option value="">All payment modes</option>
          <option value="CASH">Cash</option>
          <option value="BANK">Bank transfer</option>
          <option value="CHEQUE">Cheque</option>
          <option value="CREDIT">Credit</option>
        </select>
        <select name="partyId" defaultValue={partyId}><option value="">All customers</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="userId" defaultValue={userId}><option value="">All users</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select name="paymentStatus" defaultValue={paymentStatus}><option value="">All payment statuses</option><option value="PAID">Paid</option><option value="PARTIAL">Partial</option><option value="UNPAID">Unpaid</option></select>
        <select name="status" defaultValue={status}><option value="">All document statuses</option><option value="DRAFT">Draft</option><option value="POSTED">Posted</option><option value="CANCELLED">Cancelled</option><option value="REVERSED">Reversed</option></select>
        <input name="minAmount" type="number" min="0" step="0.01" defaultValue={filters.minAmount} placeholder="Min amount" className="h-9 w-28 rounded-lg border px-3 text-sm" />
        <input name="maxAmount" type="number" min="0" step="0.01" defaultValue={filters.maxAmount} placeholder="Max amount" className="h-9 w-28 rounded-lg border px-3 text-sm" />
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        <ExportButtons endpoint="/api/reports/transactions/export" params={{ kind: "sales", ...queryParams }} />
        {Object.keys(queryParams).length > 0 && (
          <Link href="/sales">
            <Button variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      {visibleInvoices.length === 0 ? (
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
              {visibleInvoices.map((inv) => {
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
            baseUrl={`/sales?${new URLSearchParams(queryParams).toString()}`}
          />
        </div>
      )}
    </div>
  )
}

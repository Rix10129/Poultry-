import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Download, Plus, FileText, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Pagination } from "@/components/ui/pagination"
import { PaymentMode, Prisma } from "@prisma/client"

export const metadata = { title: "Sales" }

const PAGE_SIZE = 50

type SalesSearchParams = {
  q?: string
  page?: string
  from?: string
  to?: string
  customerId?: string
  paymentMode?: string
  status?: string
  userId?: string
}

const PAYMENT_MODES = Object.values(PaymentMode)
const STATUS_FILTERS = ["all", "paid", "partial", "unpaid"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function getDateRange(from?: string, to?: string) {
  const fromDate = from ? new Date(`${from}T00:00:00`) : undefined
  const toDate = to ? new Date(`${to}T23:59:59.999`) : undefined

  return {
    fromDate: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    toDate: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
  }
}

function buildSalesBaseUrl(filters: Omit<SalesSearchParams, "page">, pathname = "/sales") {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== "all") params.set(key, value)
  }

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

function matchesStatus(net: number, paid: number, status: StatusFilter) {
  const balance = net - paid

  if (status === "paid") return balance <= 0.001
  if (status === "partial") return balance > 0.001 && paid > 0.001
  if (status === "unpaid") return balance > 0.001 && paid <= 0.001

  return true
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SalesSearchParams>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as { companyId: string }).companyId

  const {
    q,
    page: pageParam,
    from,
    to,
    customerId,
    paymentMode,
    status: statusParam,
    userId,
  } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? "1") || 1)
  const selectedPaymentMode = PAYMENT_MODES.includes(paymentMode as PaymentMode)
    ? (paymentMode as PaymentMode)
    : undefined
  const selectedStatus = STATUS_FILTERS.includes(statusParam as StatusFilter)
    ? (statusParam as StatusFilter)
    : "all"
  const { fromDate, toDate } = getDateRange(from, to)

  const where: Prisma.SaleInvoiceWhereInput = {
    companyId,
    ...(q ? { invoiceNumber: { contains: q, mode: "insensitive" } } : {}),
    ...(fromDate || toDate
      ? {
          invoiceDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(customerId ? { customerId } : {}),
    ...(selectedPaymentMode ? { paymentMode: selectedPaymentMode } : {}),
    ...(userId ? { userId } : {}),
  }

  const [allMatchingInvoices, customers, users] = await Promise.all([
    db.saleInvoice.findMany({
      where,
      include: { customer: { select: { name: true } } },
      orderBy: { invoiceDate: "desc" },
    }),
    db.customer.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  const filteredInvoices = allMatchingInvoices.filter((inv) =>
    matchesStatus(
      parseFloat(inv.netAmount.toString()),
      parseFloat(inv.paidAmount.toString()),
      selectedStatus
    )
  )
  const total = filteredInvoices.length
  const invoices = filteredInvoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const filterValues = { q, from, to, customerId, paymentMode: selectedPaymentMode, status: selectedStatus, userId }
  const baseUrl = buildSalesBaseUrl(filterValues)
  const exportUrl = buildSalesBaseUrl(filterValues, "/api/export/sales")

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
          <Link href={exportUrl}>
            <Button variant="outline">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </Link>
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

      <form method="GET" className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by invoice number…"
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            name="customerId"
            defaultValue={customerId ?? ""}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
          <input name="from" type="date" defaultValue={from} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input name="to" type="date" defaultValue={to} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select name="paymentMode" defaultValue={selectedPaymentMode ?? ""} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All payment modes</option>
            {PAYMENT_MODES.map((mode) => (
              <option key={mode} value={mode}>{mode.toLowerCase().replace("_", " ")}</option>
            ))}
          </select>
          <select name="status" defaultValue={selectedStatus} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <select name="userId" defaultValue={userId ?? ""} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All salespeople</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" size="sm">Filter</Button>
            {baseUrl !== "/sales" && (
              <Link href="/sales">
                <Button variant="ghost" size="sm">Clear</Button>
              </Link>
            )}
          </div>
        </div>
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
            baseUrl={baseUrl}
          />
        </div>
      )}
    </div>
  )
}

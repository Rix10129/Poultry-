import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Download, Printer } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDate(d: Date) {
  return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })
}

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const c = await db.customer.findUnique({ where: { id }, select: { name: true } })
  return { title: c ? `${c.name} — Statement` : "Statement" }
}

export default async function CustomerStatementPage({ params, searchParams }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string
  const companyName = (session.user as any).companyName as string ?? "Our Company"

  const customer = await db.customer.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, phone: true, address: true, area: true, openingBalance: true },
  })
  if (!customer) notFound()

  const { from, to } = await searchParams
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultTo = now

  const fromDate = from ? new Date(from + "T00:00:00") : defaultFrom
  const toDate = to ? new Date(to + "T23:59:59") : new Date(isoDate(defaultTo) + "T23:59:59")

  // Opening balance = outstanding on all invoices BEFORE this period
  const prevInvAgg = await db.saleInvoice.aggregate({
    where: { customerId: id, companyId, invoiceDate: { lt: fromDate } },
    _sum: { netAmount: true, paidAmount: true },
  })
  const prevReturnsAgg = await db.saleReturn.aggregate({
    where: { customerId: id, companyId, returnDate: { lt: fromDate } },
    _sum: { totalAmount: true },
  })
  const openingBalance =
    parseFloat(customer.openingBalance.toString()) +
    parseFloat(prevInvAgg._sum.netAmount?.toString() ?? "0") -
    parseFloat(prevInvAgg._sum.paidAmount?.toString() ?? "0") -
    parseFloat(prevReturnsAgg._sum.totalAmount?.toString() ?? "0")

  // Transactions within period
  const [invoices, payments, returns] = await Promise.all([
    db.saleInvoice.findMany({
      where: { customerId: id, companyId, invoiceDate: { gte: fromDate, lte: toDate } },
      select: { invoiceNumber: true, invoiceDate: true, netAmount: true, paidAmount: true, notes: true, schemeNotes: true },
      orderBy: { invoiceDate: "asc" },
    }),
    db.customerPayment.findMany({
      where: { customerId: id, companyId, paymentDate: { gte: fromDate, lte: toDate } },
      select: { paymentDate: true, amount: true, paymentMode: true, reference: true, invoice: { select: { invoiceNumber: true } } },
      orderBy: { paymentDate: "asc" },
    }),
    db.saleReturn.findMany({
      where: { customerId: id, companyId, returnDate: { gte: fromDate, lte: toDate } },
      select: { returnNumber: true, returnDate: true, totalAmount: true, notes: true },
      orderBy: { returnDate: "asc" },
    }),
  ])

  // Build unified ledger sorted by date
  type LedgerRow = {
    date: Date
    description: string
    debit: number
    credit: number
  }

  const ledger: LedgerRow[] = [
    ...invoices.map((inv) => ({
      date: inv.invoiceDate,
      description: `Invoice ${inv.invoiceNumber}${inv.schemeNotes ? ` — Scheme: ${inv.schemeNotes}` : ""}`,
      debit: parseFloat(inv.netAmount.toString()),
      credit: 0,
    })),
    ...payments.map((p) => ({
      date: p.paymentDate,
      description: `Payment${p.invoice ? ` (vs. ${p.invoice.invoiceNumber})` : ""} — ${p.paymentMode}${p.reference ? ` #${p.reference}` : ""}`,
      debit: 0,
      credit: parseFloat(p.amount.toString()),
    })),
    ...returns.map((r) => ({
      date: r.returnDate,
      description: `Return ${r.returnNumber}${r.notes ? ` — ${r.notes}` : ""}`,
      debit: 0,
      credit: parseFloat(r.totalAmount.toString()),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  // Running balance
  let running = openingBalance
  const ledgerWithBalance = ledger.map((row) => {
    running += row.debit - row.credit
    return { ...row, balance: running }
  })
  const closingBalance = running

  const totalDebit = ledger.reduce((s, r) => s + r.debit, 0)
  const totalCredit = ledger.reduce((s, r) => s + r.credit, 0)

  return (
    <div className="space-y-6">
      {/* Print controls — hidden when printing */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href={`/customers/${id}`} className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Account Statement</h1>
            <p className="text-sm text-slate-500">{customer.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <a
          href={`/api/customers/${id}/statement/export?from=${isoDate(fromDate)}&to=${isoDate(toDate)}`}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Download className="h-4 w-4" />
          Export Excel
        </a>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 transition-colors"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
        </div>
      </div>

      {/* Date range filter */}
      <form method="get" className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 p-4 print:hidden">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">From</label>
          <input type="date" name="from" defaultValue={isoDate(fromDate)}
            className="block border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">To</label>
          <input type="date" name="to" defaultValue={isoDate(toDate)}
            className="block border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          Apply
        </button>
      </form>

      {/* Printable statement */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{companyName}</h2>
              <p className="text-sm text-slate-500 mt-0.5">Account Statement</p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p className="font-semibold text-slate-900">{customer.name}</p>
              {customer.phone && <p>{customer.phone}</p>}
              {customer.area && <p>{customer.area}</p>}
              {customer.address && <p className="max-w-xs text-xs text-slate-500">{customer.address}</p>}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex gap-6 text-sm text-slate-600">
            <span><span className="font-medium">Period:</span> {fmtDate(fromDate)} – {fmtDate(toDate)}</span>
            <span><span className="font-medium">Date Printed:</span> {fmtDate(new Date())}</span>
          </div>
        </div>

        {/* Ledger table */}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Date</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Description</th>
              <th className="text-right px-5 py-3 font-medium text-slate-600">Debit (Dr)</th>
              <th className="text-right px-5 py-3 font-medium text-slate-600">Credit (Cr)</th>
              <th className="text-right px-5 py-3 font-medium text-slate-600">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* Opening balance row */}
            <tr className="bg-slate-50/60">
              <td className="px-5 py-3 text-slate-500 text-xs">{fmtDate(fromDate)}</td>
              <td className="px-5 py-3 font-medium text-slate-700">Balance Brought Forward</td>
              <td className="px-5 py-3 text-right text-slate-500">—</td>
              <td className="px-5 py-3 text-right text-slate-500">—</td>
              <td className={`px-5 py-3 text-right font-semibold ${openingBalance > 0 ? "text-red-600" : openingBalance < 0 ? "text-green-600" : "text-slate-500"}`}>
                {openingBalance === 0 ? "—" : formatCurrency(Math.abs(openingBalance))}
                {openingBalance > 0 ? " Dr" : openingBalance < 0 ? " Cr" : ""}
              </td>
            </tr>

            {ledgerWithBalance.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  No transactions in this period
                </td>
              </tr>
            )}

            {ledgerWithBalance.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtDate(row.date)}</td>
                <td className="px-5 py-3 text-slate-700">{row.description}</td>
                <td className="px-5 py-3 text-right text-slate-800">
                  {row.debit > 0 ? formatCurrency(row.debit) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-5 py-3 text-right text-green-700">
                  {row.credit > 0 ? formatCurrency(row.credit) : <span className="text-slate-300">—</span>}
                </td>
                <td className={`px-5 py-3 text-right font-medium ${row.balance > 0.01 ? "text-red-600" : row.balance < -0.01 ? "text-green-600" : "text-slate-500"}`}>
                  {Math.abs(row.balance) < 0.01 ? "—" : formatCurrency(Math.abs(row.balance))}
                  {row.balance > 0.01 ? " Dr" : row.balance < -0.01 ? " Cr" : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50">
            <tr>
              <td colSpan={2} className="px-5 py-3 font-bold text-slate-900">Period Totals</td>
              <td className="px-5 py-3 text-right font-bold text-slate-900">{formatCurrency(totalDebit)}</td>
              <td className="px-5 py-3 text-right font-bold text-green-700">{formatCurrency(totalCredit)}</td>
              <td className={`px-5 py-3 text-right font-bold text-base ${closingBalance > 0.01 ? "text-red-600" : closingBalance < -0.01 ? "text-green-600" : "text-slate-600"}`}>
                {Math.abs(closingBalance) < 0.01 ? "SETTLED" : formatCurrency(Math.abs(closingBalance))}
                {closingBalance > 0.01 ? " Dr" : closingBalance < -0.01 ? " Cr" : ""}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="px-6 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Dr = Amount owed by customer &nbsp;|&nbsp; Cr = Advance or overpayment by customer
          </p>
        </div>
      </div>
    </div>
  )
}

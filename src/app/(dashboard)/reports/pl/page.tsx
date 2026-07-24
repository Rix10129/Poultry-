import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

import { ReportExportControls } from "@/components/reports/export-button"
export const dynamic = "force-dynamic"
export const metadata = { title: "P&L Statement" }

const EXPENSE_LABELS: Record<string, string> = {
  FUEL: "Fuel",
  VEHICLE: "Vehicle",
  SALARY: "Salaries",
  RENT: "Rent",
  UTILITIES: "Utilities",
  OFFICE: "Office",
  MARKETING: "Marketing",
  BANK_CHARGES: "Bank Charges",
  OTHER: "Other",
}

export default async function PLPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const { from: fromStr, to: toStr } = await searchParams
  const from = fromStr ? new Date(fromStr) : defaultFrom
  const to = toStr ? new Date(toStr + "T23:59:59") : defaultTo

  const [salesAgg, invoiceItems, expenseGroups] = await Promise.all([
    db.saleInvoice.aggregate({
      where: { companyId, invoiceDate: { gte: from, lte: to } },
      _sum: { netAmount: true, taxAmount: true, discountAmount: true },
      _count: true,
    }),
    db.saleInvoiceItem.findMany({
      where: { invoice: { companyId, invoiceDate: { gte: from, lte: to } } },
      select: { quantity: true, batch: { select: { purchasePrice: true } } },
    }),
    db.expense.groupBy({
      by: ["category"],
      where: { companyId, expenseDate: { gte: from, lte: to } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
  ])

  const revenue = parseFloat(salesAgg._sum.netAmount?.toString() ?? "0")
  const taxCollected = parseFloat(salesAgg._sum.taxAmount?.toString() ?? "0")
  const discountGiven = parseFloat(salesAgg._sum.discountAmount?.toString() ?? "0")
  const invoiceCount = salesAgg._count

  const cogs = invoiceItems.reduce(
    (s, item) => s + item.quantity * parseFloat(item.batch.purchasePrice.toString()),
    0
  )

  const grossProfit = revenue - cogs
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  const totalExpenses = expenseGroups.reduce(
    (s, g) => s + parseFloat(g._sum.amount?.toString() ?? "0"),
    0
  )
  const netProfit = grossProfit - totalExpenses
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0

  const fromValue = from.toISOString().split("T")[0]
  const toValue = to.toISOString().split("T")[0]

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Profit & Loss Statement</h1>
          <p className="text-sm text-slate-500">Revenue, cost of goods, expenses, and net profit</p>
        </div>
        <ReportExportControls report="pl" />
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-500">From</label>
          <input
            type="date"
            name="from"
            defaultValue={fromValue}
            className="h-8 px-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-500">To</label>
          <input
            type="date"
            name="to"
            defaultValue={toValue}
            className="h-8 px-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button type="submit" className="h-8 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
          Apply
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Revenue */}
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Revenue</p>
          <PLRow label={`Sales — ${invoiceCount} invoice${invoiceCount !== 1 ? "s" : ""}`} value={revenue} />
          {discountGiven > 0.001 && (
            <PLRow label="Less: Discount Given" value={-discountGiven} indent />
          )}
          {taxCollected > 0.001 && (
            <PLRow label="Tax Collected" value={taxCollected} indent muted />
          )}
        </div>

        {/* COGS */}
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Cost of Goods Sold</p>
          <PLRow label="Purchase cost of goods sold" value={-cogs} />
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-900">Gross Profit</span>
              <div className="text-right">
                <span className={`text-base font-bold ${grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(Math.abs(grossProfit))}
                </span>
                <span className="ml-2 text-xs text-slate-400">({grossMarginPct.toFixed(1)}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Expenses */}
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Operating Expenses</p>
          {expenseGroups.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No expenses recorded in this period</p>
          ) : (
            expenseGroups.map((g) => (
              <PLRow
                key={g.category}
                label={EXPENSE_LABELS[g.category] ?? g.category}
                value={-parseFloat(g._sum.amount?.toString() ?? "0")}
                indent
              />
            ))
          )}
          {expenseGroups.length > 0 && (
            <PLRow label="Total Expenses" value={-totalExpenses} bold />
          )}
        </div>

        {/* Net Profit */}
        <div className={`px-6 py-5 ${netProfit >= 0 ? "bg-green-50" : "bg-red-50"}`}>
          <div className="flex justify-between items-center">
            <span className="text-base font-bold text-slate-900">Net Profit</span>
            <div className="text-right">
              <span className={`text-2xl font-bold ${netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                {netProfit < 0 && "−"}{formatCurrency(Math.abs(netProfit))}
              </span>
              <span className={`ml-2 text-xs ${netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                ({netMarginPct.toFixed(1)}% margin)
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        COGS is calculated from the purchase price of each batch at the time of sale. Expenses are from the Expenses module.
      </p>
    </div>
  )
}

function PLRow({
  label,
  value,
  indent,
  bold,
  muted,
}: {
  label: string
  value: number
  indent?: boolean
  bold?: boolean
  muted?: boolean
}) {
  const isNeg = value < 0
  return (
    <div className={`flex justify-between items-center py-1 ${indent ? "pl-4" : ""}`}>
      <span className={`text-sm ${bold ? "font-semibold text-slate-900" : muted ? "text-slate-400" : "text-slate-600"}`}>
        {label}
      </span>
      <span className={`text-sm ${bold ? "font-bold" : "font-medium"} ${
        muted ? "text-slate-400" : isNeg ? "text-red-600" : "text-slate-900"
      }`}>
        {isNeg && "− "}{formatCurrency(Math.abs(value))}
      </span>
    </div>
  )
}

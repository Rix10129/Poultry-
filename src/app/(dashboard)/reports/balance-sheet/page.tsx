import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Balance Sheet" }

export default async function BalanceSheetPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [inventoryBatches, customers, suppliers] = await Promise.all([
    db.productBatch.findMany({
      where: { companyId, quantity: { gt: 0 } },
      select: { quantity: true, purchasePrice: true },
    }),
    db.customer.findMany({
      where: { companyId },
      select: {
        openingBalance: true,
        invoices: { select: { netAmount: true, paidAmount: true } },
      },
    }),
    db.supplier.findMany({
      where: { companyId },
      select: {
        openingBalance: true,
        purchases: { select: { netAmount: true, paidAmount: true } },
      },
    }),
  ])

  // ── Assets ────────────────────────────────────────────────────────────────
  const inventoryValue = inventoryBatches.reduce(
    (s, b) => s + b.quantity * parseFloat(b.purchasePrice.toString()),
    0
  )

  const accountsReceivable = customers.reduce((total, c) => {
    const invoiceNet = c.invoices.reduce(
      (s, inv) => s + parseFloat(inv.netAmount.toString()) - parseFloat(inv.paidAmount.toString()),
      0
    )
    return total + Math.max(0, parseFloat(c.openingBalance.toString()) + invoiceNet)
  }, 0)

  const totalCurrentAssets = inventoryValue + accountsReceivable

  // ── Liabilities ──────────────────────────────────────────────────────────
  const accountsPayable = suppliers.reduce((total, s) => {
    const poNet = s.purchases.reduce(
      (sum, po) => sum + parseFloat(po.netAmount.toString()) - parseFloat(po.paidAmount.toString()),
      0
    )
    return total + Math.max(0, parseFloat(s.openingBalance.toString()) + poNet)
  }, 0)

  const totalLiabilities = accountsPayable

  // ── Equity ───────────────────────────────────────────────────────────────
  const equity = totalCurrentAssets - totalLiabilities

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Balance Sheet</h1>
          <p className="text-sm text-slate-500">Assets, liabilities, and equity as of {today}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Assets */}
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Assets</p>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Current Assets
          </p>
          <BSRow label="Inventory (at purchase cost)" value={inventoryValue} indent />
          <BSRow label="Accounts Receivable" value={accountsReceivable} indent />
          <div className="mt-3 pt-3 border-t border-slate-100">
            <BSRow label="Total Assets" value={totalCurrentAssets} bold />
          </div>
        </div>

        {/* Liabilities */}
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Liabilities</p>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Current Liabilities
          </p>
          <BSRow label="Accounts Payable" value={accountsPayable} indent />
          <div className="mt-3 pt-3 border-t border-slate-100">
            <BSRow label="Total Liabilities" value={totalLiabilities} bold />
          </div>
        </div>

        {/* Equity */}
        <div className={`px-6 py-5 ${equity >= 0 ? "bg-blue-50" : "bg-red-50"}`}>
          <div className="flex justify-between items-center">
            <div>
              <span className="text-base font-bold text-slate-900">Owner's Equity</span>
              <p className="text-xs text-slate-500 mt-0.5">Total Assets − Total Liabilities</p>
            </div>
            <span className={`text-2xl font-bold ${equity >= 0 ? "text-blue-700" : "text-red-700"}`}>
              {equity < 0 && "−"}{formatCurrency(Math.abs(equity))}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Inventory is valued at purchase cost. Receivables and payables include opening balances.
        Cash and bank balances are not tracked in this system.
      </p>
    </div>
  )
}

function BSRow({
  label,
  value,
  indent,
  bold,
}: {
  label: string
  value: number
  indent?: boolean
  bold?: boolean
}) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${indent ? "pl-4" : ""}`}>
      <span className={`text-sm ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>
        {label}
      </span>
      <span className={`text-sm font-${bold ? "bold" : "medium"} text-slate-900`}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}

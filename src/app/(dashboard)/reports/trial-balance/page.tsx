import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Scale } from "lucide-react"
import { ReportExportButton } from "@/components/reports/report-export-button"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Trial Balance" }

const TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const
const TYPE_LABELS: Record<string, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  EXPENSE: "Expenses",
}

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ zero?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { zero } = await searchParams
  const showZero = zero === "1"

  const accounts = await db.account.findMany({
    where: { companyId },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    include: {
      debitLines: { select: { amount: true } },
      creditLines: { select: { amount: true } },
    },
  })

  const rows = accounts
    .map((acc) => {
      const totalDr = acc.debitLines.reduce((s, l) => s + parseFloat(l.amount.toString()), 0)
      const totalCr = acc.creditLines.reduce((s, l) => s + parseFloat(l.amount.toString()), 0)
      const net = totalDr - totalCr
      return { account: acc, totalDr, totalCr, net }
    })
    .filter((r) => showZero || r.totalDr > 0 || r.totalCr > 0)

  const grandDr = rows.reduce((s, r) => s + r.totalDr, 0)
  const grandCr = rows.reduce((s, r) => s + r.totalCr, 0)
  const isBalanced = Math.abs(grandDr - grandCr) < 0.01

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    rows: rows.filter((r) => r.account.type === type),
  })).filter((g) => g.rows.length > 0)

  return (
    <div className="space-y-6 max-w-4xl">

      <div className="flex justify-end">
        <ReportExportButton report="trial-balance" />
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Trial Balance</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {rows.length} account{rows.length !== 1 ? "s" : ""}
              {isBalanced ? (
                <span className="ml-2 text-green-600 font-medium">· Balanced ✓</span>
              ) : (
                <span className="ml-2 text-red-600 font-medium">
                  · Unbalanced (Δ {formatCurrency(Math.abs(grandDr - grandCr))})
                </span>
              )}
            </p>
          </div>
        </div>
        <form method="GET">
          <label className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" name="zero" value="1" defaultChecked={showZero}
              onChange={(e) => (e.target.form as HTMLFormElement)?.submit()} />
            Show zero-balance accounts
          </label>
        </form>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Debits</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(grandDr)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Credits</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(grandCr)}</p>
        </div>
      </div>

      {/* Per-type tables */}
      {grouped.map(({ type, label, rows: typeRows }) => {
        const typeDr = typeRows.reduce((s, r) => s + r.totalDr, 0)
        const typeCr = typeRows.reduce((s, r) => s + r.totalCr, 0)
        return (
          <div key={type} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">{label}</h2>
              <span className="text-xs text-slate-500">
                Dr {formatCurrency(typeDr)} · Cr {formatCurrency(typeCr)}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium text-slate-600 w-24">Code</th>
                  <th className="text-left px-5 py-2.5 font-medium text-slate-600">Account Name</th>
                  <th className="text-right px-5 py-2.5 font-medium text-slate-600 w-36">Total Dr</th>
                  <th className="text-right px-5 py-2.5 font-medium text-slate-600 w-36">Total Cr</th>
                  <th className="text-right px-5 py-2.5 font-medium text-slate-600 w-36">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {typeRows.map(({ account, totalDr, totalCr, net }) => (
                  <tr key={account.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {account.code}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/accounts/${account.id}`}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {account.name}
                      </Link>
                      {account.isSystem && (
                        <span className="ml-1.5 text-[10px] text-slate-400 border border-slate-200 rounded px-1">
                          system
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-slate-600">
                      {totalDr > 0 ? formatCurrency(totalDr) : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-slate-600">
                      {totalCr > 0 ? formatCurrency(totalCr) : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono font-semibold">
                      {net > 0.001 ? (
                        <span className="text-blue-700">{formatCurrency(net)} Dr</span>
                      ) : net < -0.001 ? (
                        <span className="text-orange-600">{formatCurrency(Math.abs(net))} Cr</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={2} className="px-5 py-2 text-xs font-semibold text-right text-slate-600">
                    {label} Total
                  </td>
                  <td className="px-5 py-2 text-right font-bold font-mono text-slate-700">
                    {formatCurrency(typeDr)}
                  </td>
                  <td className="px-5 py-2 text-right font-bold font-mono text-slate-700">
                    {formatCurrency(typeCr)}
                  </td>
                  <td className="px-5 py-2 text-right font-bold font-mono">
                    {typeDr - typeCr > 0.001 ? (
                      <span className="text-blue-700">{formatCurrency(typeDr - typeCr)} Dr</span>
                    ) : typeCr - typeDr > 0.001 ? (
                      <span className="text-orange-600">{formatCurrency(typeCr - typeDr)} Cr</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      })}

      {/* Grand total */}
      {rows.length > 0 && (
        <div className={`rounded-xl border p-5 ${isBalanced ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className={`h-4 w-4 ${isBalanced ? "text-green-600" : "text-red-600"}`} />
              <span className={`text-sm font-semibold ${isBalanced ? "text-green-700" : "text-red-700"}`}>
                {isBalanced ? "Trial balance is balanced" : "Trial balance is NOT balanced"}
              </span>
            </div>
            <div className="text-sm font-mono font-bold">
              <span className="text-slate-700 mr-4">Dr {formatCurrency(grandDr)}</span>
              <span className="text-slate-700">Cr {formatCurrency(grandCr)}</span>
            </div>
          </div>
          {!isBalanced && (
            <p className="text-xs text-red-600 mt-1">
              Difference: {formatCurrency(Math.abs(grandDr - grandCr))} — check for unbalanced vouchers.
            </p>
          )}
        </div>
      )}

      {rows.length === 0 && (
        <div className="py-16 text-center">
          <Scale className="h-8 w-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No journal entries posted yet</p>
        </div>
      )}
    </div>
  )
}

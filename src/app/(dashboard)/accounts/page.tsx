import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, BookOpen, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"

export const metadata = { title: "Chart of Accounts" }

const TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]
const TYPE_LABELS: Record<string, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  EXPENSE: "Expenses",
}
const TYPE_VARIANTS: Record<string, "info" | "warning" | "success" | "default" | "danger"> = {
  ASSET: "info",
  LIABILITY: "warning",
  EQUITY: "success",
  REVENUE: "default",
  EXPENSE: "danger",
}

export default async function AccountsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const accounts = await db.account.findMany({
    where: { companyId },
    include: {
      debitLines: { select: { amount: true } },
      creditLines: { select: { amount: true } },
    },
    orderBy: [{ type: "asc" }, { code: "asc" }],
  })

  // Group by type, compute balance per account
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    variant: TYPE_VARIANTS[type],
    accounts: accounts
      .filter((a) => a.type === type)
      .map((a) => {
        const dr = a.debitLines.reduce((s, l) => s + parseFloat(l.amount.toString()), 0)
        const cr = a.creditLines.reduce((s, l) => s + parseFloat(l.amount.toString()), 0)
        return { ...a, balance: dr - cr }
      }),
  })).filter((g) => g.accounts.length > 0)

  const totalVouchers = await db.journalEntry.count({ where: { companyId } })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/accounts/vouchers">
            <Button variant="outline">
              <ClipboardList className="h-4 w-4" />
              Day Book
              {totalVouchers > 0 && (
                <span className="ml-1 text-xs text-slate-400">({totalVouchers})</span>
              )}
            </Button>
          </Link>
          <Link href="/accounts/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Account
            </Button>
          </Link>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No accounts yet</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm">
            Create your chart of accounts (e.g. Cash, Bank, Sales, Expenses) to start posting vouchers.
          </p>
          <Link href="/accounts/new" className="mt-4">
            <Button><Plus className="h-4 w-4" />New Account</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.type} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <Badge variant={group.variant}>{group.label}</Badge>
                <span className="text-xs text-slate-400">
                  {group.accounts.length} account{group.accounts.length !== 1 ? "s" : ""}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500 w-24">Code</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Name</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500 w-32">Debit Bal.</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500 w-32">Credit Bal.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {group.accounts.map((account) => (
                    <tr key={account.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {account.code}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/accounts/${account.id}`}
                          className="font-medium text-blue-600 hover:text-blue-700"
                        >
                          {account.name}
                        </Link>
                        {account.isSystem && (
                          <span className="ml-2 text-xs text-slate-400 italic">system</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm">
                        {account.balance > 0 ? (
                          <span className="text-slate-900">{formatCurrency(account.balance)}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm">
                        {account.balance < 0 ? (
                          <span className="text-slate-900">{formatCurrency(Math.abs(account.balance))}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

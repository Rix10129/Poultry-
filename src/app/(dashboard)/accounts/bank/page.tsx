import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Landmark } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"

export const metadata = { title: "Bank Accounts" }

export default async function BankAccountsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const accounts = await db.account.findMany({
    where: { companyId, isBank: true },
    include: {
      debitLines: { select: { amount: true } },
      creditLines: { select: { amount: true } },
    },
    orderBy: { code: "asc" },
  })

  const rows = accounts.map((a) => {
    const dr = a.debitLines.reduce((s, l) => s + parseFloat(l.amount.toString()), 0)
    const cr = a.creditLines.reduce((s, l) => s + parseFloat(l.amount.toString()), 0)
    return { ...a, balance: dr - cr }
  })
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/accounts" className="text-slate-400 hover:text-slate-600 text-sm">
              Accounts
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-2xl font-bold text-slate-900">Bank Accounts</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {rows.length} account{rows.length !== 1 ? "s" : ""} · {formatCurrency(totalBalance)} combined balance
          </p>
        </div>
        <Link href="/accounts/new?isBank=1">
          <Button>
            <Plus className="h-4 w-4" />
            New Bank Account
          </Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Landmark className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No bank accounts yet</p>
          <p className="text-sm text-slate-400 mt-1 max-w-sm">
            Create an account and tick &ldquo;This is a bank account&rdquo; to have it show up here — the same
            account is still usable everywhere else in the Chart of Accounts.
          </p>
          <Link href="/accounts/new?isBank=1" className="mt-4">
            <Button><Plus className="h-4 w-4" />New Bank Account</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600 w-24">Code</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 w-40">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((account) => (
                <tr key={account.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {account.code}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/accounts/${account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                      {account.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                    {formatCurrency(account.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

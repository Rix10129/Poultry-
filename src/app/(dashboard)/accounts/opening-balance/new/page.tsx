import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { OpeningBalanceForm } from "@/components/accounts/opening-balance-form"
import { SYSTEM_ACCOUNTS } from "@/lib/accounting/system-accounts"

export const metadata = { title: "Opening Balance" }

// Correcting the AR/AP control accounts directly (instead of through the
// customer/supplier's own opening balance) would desync them from the
// subsidiary ledger those totals are supposed to mirror — and the equity
// account itself can't be its own offsetting entry.
const EXCLUDED_CODES: string[] = [SYSTEM_ACCOUNTS.OPENING_EQUITY.code, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE.code, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE.code]

export default async function NewOpeningBalancePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [customers, suppliers, accounts] = await Promise.all([
    db.customer.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, openingBalance: true } }),
    db.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, openingBalance: true } }),
    db.account.findMany({ where: { companyId }, orderBy: [{ type: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, type: true } }),
  ])

  const openingEquityAccountId = accounts.find(a => a.code === SYSTEM_ACCOUNTS.OPENING_EQUITY.code)?.id ?? ""
  const glAccounts = accounts
    .filter(a => !EXCLUDED_CODES.includes(a.code))
    .map(a => ({ id: a.id, code: a.code, name: a.name, type: a.type }))

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/accounts" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Opening Balance</h1>
          <p className="text-sm text-slate-500">Set a starting balance for a customer, supplier, or account</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <OpeningBalanceForm
          customers={customers.map(c => ({ id: c.id, name: c.name, openingBalance: Number(c.openingBalance) }))}
          suppliers={suppliers.map(s => ({ id: s.id, name: s.name, openingBalance: Number(s.openingBalance) }))}
          glAccounts={glAccounts}
          openingEquityAccountId={openingEquityAccountId}
        />
      </div>
    </div>
  )
}

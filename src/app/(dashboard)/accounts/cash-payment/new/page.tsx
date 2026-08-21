import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { CashPaymentForm } from "@/components/accounts/cash-payment-form"
import { SYSTEM_ACCOUNTS } from "@/lib/accounting/system-accounts"

export const metadata = { title: "Cash Payment" }

// Fund accounts are chosen via Payment Mode, not this list. The AR/AP
// control accounts are excluded too — debiting them directly here would
// desync them from the customer/supplier subsidiary ledgers they're meant
// to mirror; use the Customer/Supplier path (or Opening Balance) instead.
const EXCLUDED_CODES: string[] = [
  SYSTEM_ACCOUNTS.CASH.code, SYSTEM_ACCOUNTS.BANK.code, SYSTEM_ACCOUNTS.CHEQUES_RECEIVABLE.code, SYSTEM_ACCOUNTS.CHEQUES_PAYABLE.code,
  SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE.code, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE.code,
]

export default async function NewCashPaymentPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [suppliers, accounts] = await Promise.all([
    db.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.account.findMany({ where: { companyId }, orderBy: [{ type: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true } }),
  ])

  const systemAccountIds = {
    CASH: accounts.find(a => a.code === SYSTEM_ACCOUNTS.CASH.code)?.id ?? "",
    BANK: accounts.find(a => a.code === SYSTEM_ACCOUNTS.BANK.code)?.id ?? "",
    CHEQUES_PAYABLE: accounts.find(a => a.code === SYSTEM_ACCOUNTS.CHEQUES_PAYABLE.code)?.id ?? "",
  }
  const otherAccounts = accounts.filter(a => !EXCLUDED_CODES.includes(a.code))

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/accounts" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cash Payment</h1>
          <p className="text-sm text-slate-500">Record money going out</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <CashPaymentForm suppliers={suppliers} otherAccounts={otherAccounts} systemAccountIds={systemAccountIds} />
      </div>
    </div>
  )
}

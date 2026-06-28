import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity",
  REVENUE: "Revenue", EXPENSE: "Expense",
}
const TYPE_VARIANTS: Record<string, "info" | "warning" | "success" | "default" | "danger"> = {
  ASSET: "info", LIABILITY: "warning", EQUITY: "success", REVENUE: "default", EXPENSE: "danger",
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const a = await db.account.findUnique({ where: { id }, select: { name: true } })
  return { title: a?.name ?? "Account" }
}

export default async function AccountDetailPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [account, debitLines, creditLines] = await Promise.all([
    db.account.findFirst({ where: { id, companyId } }),
    db.journalLine.findMany({
      where: { debitAccountId: id, journalEntry: { companyId } },
      include: {
        journalEntry: {
          select: { id: true, voucherNumber: true, entryDate: true, description: true, voucherType: true },
        },
      },
      orderBy: { journalEntry: { entryDate: "asc" } },
    }),
    db.journalLine.findMany({
      where: { creditAccountId: id, journalEntry: { companyId } },
      include: {
        journalEntry: {
          select: { id: true, voucherNumber: true, entryDate: true, description: true, voucherType: true },
        },
      },
      orderBy: { journalEntry: { entryDate: "asc" } },
    }),
  ])

  if (!account) notFound()

  // Merge debit + credit entries, sorted by date
  type LedgerRow = {
    key: string
    date: Date
    voucherNumber: string
    entryId: string
    description: string
    debit: number
    credit: number
    balance: number
  }

  interface JLine {
    id: string
    amount: { toString(): string }
    description: string | null
    journalEntry: {
      id: string
      voucherNumber: string
      entryDate: Date
      description: string
      voucherType: string
    }
  }

  const rows: Omit<LedgerRow, "balance">[] = [
    ...(debitLines as JLine[]).map((l) => ({
      key: `dr-${l.id}`,
      date: l.journalEntry.entryDate,
      voucherNumber: l.journalEntry.voucherNumber,
      entryId: l.journalEntry.id,
      description: l.description ?? l.journalEntry.description,
      debit: parseFloat(l.amount.toString()),
      credit: 0,
    })),
    ...(creditLines as JLine[]).map((l) => ({
      key: `cr-${l.id}`,
      date: l.journalEntry.entryDate,
      voucherNumber: l.journalEntry.voucherNumber,
      entryId: l.journalEntry.id,
      description: l.description ?? l.journalEntry.description,
      debit: 0,
      credit: parseFloat(l.amount.toString()),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  let running = 0
  const ledger: LedgerRow[] = rows.map((row) => {
    running += row.debit - row.credit
    return { ...row, balance: running }
  })

  const totalDr = debitLines.reduce((s, l) => s + parseFloat(l.amount.toString()), 0)
  const totalCr = creditLines.reduce((s, l) => s + parseFloat(l.amount.toString()), 0)
  const balance = totalDr - totalCr

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/accounts" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {account.code}
              </span>
              <h1 className="text-xl font-bold text-slate-900">{account.name}</h1>
              <Badge variant={TYPE_VARIANTS[account.type] ?? "default"}>
                {TYPE_LABELS[account.type] ?? account.type}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{ledger.length} transaction{ledger.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        {!account.isSystem && (
          <Link href={`/accounts/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
        )}
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Debits", value: totalDr, color: "text-slate-900" },
          { label: "Total Credits", value: totalCr, color: "text-slate-900" },
          {
            label: "Net Balance",
            value: Math.abs(balance),
            color: balance > 0 ? "text-blue-600" : balance < 0 ? "text-red-600" : "text-green-600",
            suffix: balance > 0 ? " Dr" : balance < 0 ? " Cr" : "",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>
              {formatCurrency(s.value)}
              {"suffix" in s && <span className="text-sm font-medium ml-0.5">{s.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Ledger table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Account Ledger</h2>
        </div>
        {ledger.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-400">No transactions posted to this account yet</p>
            <Link href="/accounts/vouchers/new" className="mt-3 inline-block">
              <Button size="sm" variant="outline">Post a voucher</Button>
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Voucher</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Debit</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Credit</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                    {formatDate(row.date)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/accounts/vouchers/${row.entryId}`}
                      className="font-mono text-blue-600 hover:text-blue-700 font-medium text-xs"
                    >
                      {row.voucherNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{row.description}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                    {row.debit > 0 ? formatCurrency(row.debit) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                    {row.credit > 0 ? formatCurrency(row.credit) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">
                    <span className={row.balance >= 0 ? "text-slate-900" : "text-red-600"}>
                      {formatCurrency(Math.abs(row.balance))}
                      <span className="text-xs font-normal ml-0.5 text-slate-400">
                        {row.balance > 0 ? "Dr" : row.balance < 0 ? "Cr" : ""}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

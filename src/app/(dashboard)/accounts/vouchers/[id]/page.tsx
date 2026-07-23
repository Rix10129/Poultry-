import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { PrintButton } from "@/components/sales/print-button"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

const VOUCHER_LABELS: Record<string, string> = {
  CASH_RECEIPT: "Cash Receipt",
  CASH_PAYMENT: "Cash Payment",
  BANK_RECEIPT: "Bank Receipt",
  BANK_PAYMENT: "Bank Payment",
  JOURNAL: "Journal Voucher",
}
const VOUCHER_VARIANTS: Record<string, "success" | "danger" | "info" | "warning" | "default"> = {
  CASH_RECEIPT: "success",
  CASH_PAYMENT: "danger",
  BANK_RECEIPT: "info",
  BANK_PAYMENT: "warning",
  JOURNAL: "default",
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const e = await db.journalEntry.findUnique({ where: { id }, select: { voucherNumber: true } })
  return { title: e?.voucherNumber ?? "Voucher" }
}

export default async function VoucherDetailPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const entry = await db.journalEntry.findFirst({
    where: { id, companyId },
    include: {
      lines: {
        include: {
          debitAccount: { select: { code: true, name: true } },
          creditAccount: { select: { code: true, name: true } },
        },
      },
    },
  })

  if (!entry) notFound()

  const totalDr = entry.lines.reduce(
    (s, l) => (l.debitAccountId ? s + parseFloat(l.amount.toString()) : s),
    0
  )
  const totalCr = entry.lines.reduce(
    (s, l) => (l.creditAccountId ? s + parseFloat(l.amount.toString()) : s),
    0
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6 print:max-w-none print:space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/accounts/vouchers" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 font-mono">{entry.voucherNumber}</h1>
              <Badge variant={VOUCHER_VARIANTS[entry.voucherType] ?? "default"}>
                {VOUCHER_LABELS[entry.voucherType] ?? entry.voucherType}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{formatDate(entry.entryDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2"><Link href={`/accounts/vouchers/${id}/edit`} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">Edit</Link><PrintButton /></div>
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">{VOUCHER_LABELS[entry.voucherType] ?? entry.voucherType}</h1>
        <p className="font-mono text-lg">{entry.voucherNumber}</p>
        <p className="text-sm mt-1">Date: {formatDate(entry.entryDate)}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden print:border-none print:rounded-none">
        {/* Meta */}
        <div className="px-6 py-4 border-b border-slate-200 space-y-1">
          <p className="text-sm font-medium text-slate-900">{entry.description}</p>
          {entry.reference && (
            <p className="text-xs text-slate-500">Ref: {entry.reference}</p>
          )}
        </div>

        {/* Lines */}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Account</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Description</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600 w-36">Debit</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600 w-36">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entry.lines.map((line, idx) => {
              const amt = parseFloat(line.amount.toString())
              return (
                <tr key={line.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    {line.debitAccountId && line.debitAccount && (
                      <div>
                        <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mr-1.5">
                          {line.debitAccount.code}
                        </span>
                        <Link
                          href={`/accounts/${line.debitAccountId}`}
                          className="font-medium text-blue-600 hover:text-blue-700"
                        >
                          {line.debitAccount.name}
                        </Link>
                      </div>
                    )}
                    {line.creditAccountId && line.creditAccount && (
                      <div className={line.debitAccountId ? "mt-1 pl-4" : ""}>
                        <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mr-1.5">
                          {line.creditAccount.code}
                        </span>
                        <Link
                          href={`/accounts/${line.creditAccountId}`}
                          className="font-medium text-blue-600 hover:text-blue-700 italic"
                        >
                          {line.creditAccount.name}
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-500">{line.description ?? "—"}</td>
                  <td className="px-6 py-3 text-right font-mono text-slate-900">
                    {line.debitAccountId ? formatCurrency(amt) : "—"}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-slate-900">
                    {line.creditAccountId ? formatCurrency(amt) : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50">
            <tr>
              <td colSpan={2} className="px-6 py-3 text-sm font-semibold text-slate-900 text-right">
                Totals
              </td>
              <td className="px-6 py-3 text-right font-bold font-mono text-slate-900">
                {formatCurrency(totalDr)}
              </td>
              <td className="px-6 py-3 text-right font-bold font-mono text-slate-900">
                {formatCurrency(totalCr)}
              </td>
            </tr>
          </tfoot>
        </table>

        {Math.abs(totalDr - totalCr) > 0.001 && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200">
            <p className="text-xs text-red-600">
              Warning: This voucher is unbalanced (Dr {formatCurrency(totalDr)} ≠ Cr {formatCurrency(totalCr)}).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

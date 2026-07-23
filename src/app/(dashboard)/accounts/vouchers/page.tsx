import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"

export const metadata = { title: "Day Book" }

const VOUCHER_LABELS: Record<string, string> = {
  CASH_RECEIPT: "Cash Receipt",
  CASH_PAYMENT: "Cash Payment",
  BANK_RECEIPT: "Bank Receipt",
  BANK_PAYMENT: "Bank Payment",
  JOURNAL: "Journal",
}
const VOUCHER_VARIANTS: Record<string, "success" | "danger" | "info" | "warning" | "default"> = {
  CASH_RECEIPT: "success",
  CASH_PAYMENT: "danger",
  BANK_RECEIPT: "info",
  BANK_PAYMENT: "warning",
  JOURNAL: "default",
}

export default async function DayBookPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; from?: string; to?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { q, type, from, to } = await searchParams

  const entries = await db.journalEntry.findMany({
    where: {
      companyId,
      ...(q ? { OR: [
        { voucherNumber: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ]} : {}),
      ...(type ? { voucherType: type as any } : {}),
      ...(from || to ? {
        entryDate: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to + "T23:59:59") } : {}),
        },
      } : {}),
    },
    orderBy: { entryDate: "desc" },
    take: 100,
  })

  const totalAmount = entries.reduce((s, e) => s + parseFloat(e.totalAmount.toString()), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/accounts" className="text-slate-400 hover:text-slate-600 text-sm">
              Accounts
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-2xl font-bold text-slate-900">Day Book</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {entries.length} voucher{entries.length !== 1 ? "s" : ""} · {formatCurrency(totalAmount)} total
          </p>
        </div>
        <Link href="/accounts/vouchers/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Voucher
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by number or description…"
          className="h-9 w-60 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="type"
          defaultValue={type ?? ""}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All types</option>
          {Object.entries(VOUCHER_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input
          name="from"
          type="date"
          defaultValue={from}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          name="to"
          type="date"
          defaultValue={to}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button type="submit" variant="outline" size="sm">Filter</Button>
        {(q || type || from || to) && (
          <Link href="/accounts/vouchers">
            <Button variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No vouchers yet</p>
          <p className="text-sm text-slate-400 mt-1">Post your first voucher to record a transaction</p>
          <Link href="/accounts/vouchers/new" className="mt-4">
            <Button><Plus className="h-4 w-4" />New Voucher</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Voucher #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Reference</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/accounts/vouchers/${entry.id}`}
                      className="font-mono font-semibold text-blue-600 hover:text-blue-700"
                    >
                      {entry.voucherNumber}
                    </Link>
                    <Link href={`/accounts/vouchers/${entry.id}/edit`} className="ml-2 text-xs text-slate-500 hover:text-blue-600">Edit</Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {formatDate(entry.entryDate)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={VOUCHER_VARIANTS[entry.voucherType] ?? "default"}>
                      {VOUCHER_LABELS[entry.voucherType] ?? entry.voucherType}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{entry.description}</td>
                  <td className="px-4 py-3 text-slate-500">{entry.reference ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(parseFloat(entry.totalAmount.toString()))}
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

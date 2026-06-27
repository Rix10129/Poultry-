import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { VoucherForm } from "@/components/accounts/voucher-form"

export const metadata = { title: "New Voucher" }

export default async function NewVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { type } = await searchParams

  const accounts = await db.account.findMany({
    where: { companyId },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, type: true },
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/accounts/vouchers" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Voucher</h1>
          <p className="text-sm text-slate-500">Post a double-entry accounting entry</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm font-medium text-amber-800">No accounts in your chart of accounts yet.</p>
          <p className="text-sm text-amber-700 mt-1">
            <Link href="/accounts/new" className="underline">Create accounts</Link> before posting vouchers.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <VoucherForm accounts={accounts} defaultType={type ?? "JOURNAL"} />
        </div>
      )}
    </div>
  )
}

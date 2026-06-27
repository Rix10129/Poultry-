import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { AccountForm } from "@/components/accounts/account-form"

export const metadata = { title: "New Account" }

export default async function NewAccountPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const accounts = await db.account.findMany({
    where: { companyId },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, type: true },
  })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/accounts" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Account</h1>
          <p className="text-sm text-slate-500">Add to your chart of accounts</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <AccountForm accounts={accounts} />
      </div>
    </div>
  )
}

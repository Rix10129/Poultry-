import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { AccountForm } from "@/components/accounts/account-form"
import { deleteAccount } from "@/app/(dashboard)/accounts/actions"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const a = await db.account.findUnique({ where: { id }, select: { name: true } })
  return { title: `Edit ${a?.name ?? "Account"}` }
}

export default async function EditAccountPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [account, accounts] = await Promise.all([
    db.account.findFirst({ where: { id, companyId } }),
    db.account.findMany({
      where: { companyId },
      orderBy: [{ type: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, type: true },
    }),
  ])

  if (!account) notFound()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/accounts/${id}`} className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Edit Account</h1>
          <p className="text-sm text-slate-500">{account.name}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <AccountForm
          account={{
            id: account.id,
            code: account.code,
            name: account.name,
            type: account.type,
            parentId: account.parentId,
            isSystem: account.isSystem,
          }}
          accounts={accounts}
        />
      </div>

      {!account.isSystem && (
        <div className="rounded-xl border border-red-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-red-700 mb-1">Danger Zone</h2>
          <p className="text-sm text-slate-500 mb-4">
            Deleting an account will fail if it has any journal entries posted to it.
          </p>
          <form action={deleteAccount}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
            >
              Delete Account
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

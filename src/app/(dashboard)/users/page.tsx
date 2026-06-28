import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, UserCog } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Users" }

const ROLE_VARIANTS: Record<string, "success" | "info" | "default" | "warning"> = {
  OWNER: "success",
  ADMIN: "info",
  CASHIER: "default",
  SALESMAN: "warning",
}
const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  CASHIER: "Cashier",
  SALESMAN: "Salesman",
}

export default async function UsersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const actor = session.user as any
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") redirect("/")

  const companyId = actor.companyId as string

  const users = await db.user.findMany({
    where: { companyId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  })

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {users.length} user{users.length !== 1 ? "s" : ""} in your company
          </p>
        </div>
        <Link href="/users/new">
          <Button>
            <Plus className="h-4 w-4" />
            New User
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <UserCog className="h-10 w-10 text-slate-300 mb-3" />
            <p className="font-medium text-slate-600">No users yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Email</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Role</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Joined</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`hover:bg-slate-50 transition-colors ${!u.isActive ? "opacity-50" : ""}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-[11px] font-bold text-blue-600 shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{u.name}</p>
                        {u.phone && <p className="text-xs text-slate-400">{u.phone}</p>}
                      </div>
                    </div>
                    {u.id === actor.id && (
                      <span className="ml-9 text-[10px] text-slate-400 font-medium">(you)</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{u.email}</td>
                  <td className="px-5 py-3">
                    <Badge variant={ROLE_VARIANTS[u.role] ?? "default"}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    {u.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="danger">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/users/${u.id}`}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-slate-500 mb-1">Role permissions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 text-xs text-slate-600">
          <div><span className="font-semibold text-green-700">Owner</span> — Full access, manage all users</div>
          <div><span className="font-semibold text-blue-700">Admin</span> — All operations, manage cashiers/salesmen</div>
          <div><span className="font-semibold text-slate-700">Cashier</span> — Sales, purchases, inventory</div>
          <div><span className="font-semibold text-orange-600">Salesman</span> — Sales and customer management</div>
        </div>
      </div>
    </div>
  )
}

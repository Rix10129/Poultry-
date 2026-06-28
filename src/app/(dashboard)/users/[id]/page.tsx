import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { UserForm } from "@/components/users/user-form"
import { ChangePasswordForm } from "@/components/users/change-password-form"
import { toggleActive } from "@/app/(dashboard)/users/actions"
import { formatDate } from "@/lib/utils"
import { UserRole } from "@prisma/client"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

const ROLE_HIERARCHY: Record<string, UserRole[]> = {
  OWNER: ["OWNER", "ADMIN", "CASHIER", "SALESMAN"],
  ADMIN: ["CASHIER", "SALESMAN"],
}

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

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const u = await db.user.findUnique({ where: { id }, select: { name: true } })
  return { title: u?.name ?? "User" }
}

export default async function UserDetailPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const actor = session.user as any
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") redirect("/")

  const user = await db.user.findFirst({
    where: { id, companyId: actor.companyId },
  })

  if (!user) notFound()

  const allowedRoles = ROLE_HIERARCHY[actor.role] ?? []
  const canEdit = allowedRoles.includes(user.role)
  const isSelf = id === actor.id

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/users" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{user.name}</h1>
            <Badge variant={ROLE_VARIANTS[user.role] ?? "default"}>
              {ROLE_LABELS[user.role] ?? user.role}
            </Badge>
            {!user.isActive && <Badge variant="danger">Inactive</Badge>}
            {isSelf && (
              <span className="text-xs text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                you
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {user.email} · Joined {formatDate(user.createdAt)}
          </p>
        </div>
      </div>

      {/* Edit profile */}
      {canEdit ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Profile</h2>
          <UserForm
            user={{
              id: user.id,
              name: user.name,
              email: user.email,
              phone: user.phone,
              role: user.role as any,
            }}
            allowedRoles={allowedRoles as any}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Profile</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Name</p>
              <p className="text-slate-900 font-medium">{user.name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Email</p>
              <p className="text-slate-900">{user.email}</p>
            </div>
            {user.phone && (
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Phone</p>
                <p className="text-slate-900">{user.phone}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-amber-600 mt-4 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
            You do not have permission to edit an Owner account.
          </p>
        </div>
      )}

      {/* Change password */}
      {canEdit && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Change Password</h2>
          <p className="text-xs text-slate-500 mb-4">
            {isSelf ? "Update your own password." : "Reset this user's password."}
          </p>
          <ChangePasswordForm userId={user.id} />
        </div>
      )}

      {/* Danger zone — cannot deactivate yourself or out-of-hierarchy users */}
      {canEdit && !isSelf && (
        <div className="rounded-xl border border-red-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-red-700 mb-1">Danger Zone</h2>
          <p className="text-sm text-slate-500 mb-4">
            {user.isActive
              ? "Deactivating this user will prevent them from logging in immediately."
              : "Reactivating this user will restore their access."}
          </p>
          <form action={toggleActive}>
            <input type="hidden" name="id" value={user.id} />
            <button
              type="submit"
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                user.isActive
                  ? "text-red-600 border-red-300 hover:bg-red-50"
                  : "text-green-700 border-green-300 hover:bg-green-50"
              }`}
            >
              {user.isActive ? "Deactivate User" : "Reactivate User"}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { UserForm } from "@/components/users/user-form"
import { UserRole } from "@prisma/client"

export const metadata = { title: "New User" }

const ROLE_HIERARCHY: Record<string, UserRole[]> = {
  OWNER: ["OWNER", "ADMIN", "CASHIER", "SALESMAN"],
  ADMIN: ["CASHIER", "SALESMAN"],
}

export default async function NewUserPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const actor = session.user as any
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") redirect("/")

  const allowedRoles = ROLE_HIERARCHY[actor.role] ?? []

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/users" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New User</h1>
          <p className="text-sm text-slate-500">Add a team member to your company</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <UserForm allowedRoles={allowedRoles as any} />
      </div>
    </div>
  )
}

"use client"

import { useActionState } from "react"
import { createUser, updateUser } from "@/app/(dashboard)/users/actions"
import { Button } from "@/components/ui/button"

type UserRole = "OWNER" | "ADMIN" | "CASHIER" | "SALESMAN"

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  CASHIER: "Cashier",
  SALESMAN: "Salesman",
}

interface Props {
  user?: {
    id: string
    name: string
    email: string
    phone: string | null
    role: UserRole
  }
  allowedRoles: UserRole[]
}

export function UserForm({ user, allowedRoles }: Props) {
  const [state, formAction, pending] = useActionState(
    user ? updateUser : createUser,
    null
  )

  return (
    <form action={formAction} className="space-y-5">
      {user && <input type="hidden" name="id" value={user.id} />}

      {state && "error" in state && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            required
            defaultValue={user?.name}
            placeholder="Muhammad Ali"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            name="email"
            type="email"
            required
            defaultValue={user?.email}
            placeholder="ali@company.com"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
          <input
            name="phone"
            type="tel"
            defaultValue={user?.phone ?? ""}
            placeholder="+92 300 0000000"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Role <span className="text-red-500">*</span>
          </label>
          <select
            name="role"
            defaultValue={user?.role ?? allowedRoles[0]}
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {allowedRoles.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>

        {!user && (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              placeholder="Min 6 characters"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : user ? "Save Changes" : "Create User"}
        </Button>
      </div>
    </form>
  )
}

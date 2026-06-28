"use client"

import { useActionState } from "react"
import { changePassword } from "@/app/(dashboard)/users/actions"
import { Button } from "@/components/ui/button"

interface Props {
  userId: string
}

export function ChangePasswordForm({ userId }: Props) {
  const [state, formAction, pending] = useActionState(changePassword, null)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={userId} />

      {state && "error" in state && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state && "ok" in state && (
        <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Password updated successfully.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            New Password <span className="text-red-500">*</span>
          </label>
          <input
            name="newPassword"
            type="password"
            required
            minLength={6}
            placeholder="Min 6 characters"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Confirm Password <span className="text-red-500">*</span>
          </label>
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={6}
            placeholder="Repeat password"
            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Updating…" : "Change Password"}
      </Button>
    </form>
  )
}

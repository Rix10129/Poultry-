"use client"

import { useState } from "react"
import Link from "next/link"
import { signOut } from "next-auth/react"
import type { Session } from "next-auth"
import { Bell, ChevronDown, LogOut, User } from "lucide-react"

const roleBadge: Record<string, string> = {
  OWNER:    "bg-purple-100 text-purple-700 border-purple-200",
  ADMIN:    "bg-blue-100   text-blue-700   border-blue-200",
  CASHIER:  "bg-green-100  text-green-700  border-green-200",
  SALESMAN: "bg-orange-100 text-orange-700 border-orange-200",
}

interface TopbarProps {
  session: Session
  alertCount?: number
}

export function Topbar({ session, alertCount = 0 }: TopbarProps) {
  const [open, setOpen] = useState(false)
  const user = session.user as any
  const initials = (user.name as string)
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()

  return (
    <header className="h-13 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 print:hidden">
      <span className="text-sm font-semibold text-slate-800">{user.companyName}</span>

      <div className="flex items-center gap-2">
        {/* Alert bell */}
        <Link
          href="/alerts"
          className="relative p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title={alertCount > 0 ? `${alertCount} alerts` : "Alerts"}
        >
          <Bell className="w-4.5 h-4.5" />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] flex items-center justify-center bg-red-500 rounded-full ring-2 ring-white text-white text-[10px] font-bold px-0.5">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="text-left hidden sm:block leading-none">
              <p className="text-xs font-semibold text-slate-900">{user.name}</p>
              <span
                className={`inline-block mt-0.5 px-1.5 py-px text-[10px] font-semibold rounded border ${
                  roleBadge[user.role] ?? "bg-slate-100 text-slate-500 border-slate-200"
                }`}
              >
                {user.role}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl border border-slate-200 shadow-lg z-20 overflow-hidden py-1">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
                <button className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  <User className="w-4 h-4 text-slate-400" />
                  Profile
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

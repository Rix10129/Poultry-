"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Building2,
  BookOpen,
  BarChart3,
  Settings,
  Syringe,
} from "lucide-react"

const navSections = [
  {
    title: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/inventory", label: "Inventory", icon: Package },
      { href: "/sales",     label: "Sales",     icon: ShoppingCart },
      { href: "/purchases", label: "Purchases", icon: Truck },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/suppliers", label: "Suppliers", icon: Building2 },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/accounts", label: "Accounts", icon: BookOpen },
    ],
  },
  {
    title: "Analytics",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-slate-900 flex flex-col border-r border-slate-800 shrink-0 h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Syringe className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">Poultry Vet</p>
            <p className="text-[11px] text-slate-500 leading-tight">Distribution System</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="px-2 mb-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-blue-600 text-white"
                          : "text-slate-400 hover:text-white hover:bg-slate-800"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-slate-800">
        <p className="text-[11px] text-slate-600 text-center">v1.0 · Module 1 of 9</p>
      </div>
    </aside>
  )
}

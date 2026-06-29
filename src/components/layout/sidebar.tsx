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
  Bell,
  UserCog,
  FileText,
} from "lucide-react"

const navSections = [
  {
    title: "Overview",
    items: [
      { href: "/",       label: "Dashboard", icon: LayoutDashboard, alert: false },
      { href: "/alerts", label: "Alerts",    icon: Bell,            alert: true  },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/inventory", label: "Inventory", icon: Package,      alert: false },
      { href: "/sales",     label: "Sales",     icon: ShoppingCart, alert: false },
      { href: "/purchases", label: "Purchases", icon: Truck,        alert: false },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/customers", label: "Customers", icon: Users,     alert: false },
      { href: "/suppliers", label: "Suppliers", icon: Building2, alert: false },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/accounts",     label: "Accounts",  icon: BookOpen,  alert: false },
      { href: "/accounts/pdc", label: "PDC Cheques", icon: FileText, alert: false },
    ],
  },
  {
    title: "Analytics",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3, alert: false },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/users",    label: "Users",    icon: UserCog, alert: false, adminOnly: true },
      { href: "/settings", label: "Settings", icon: Settings, alert: false },
    ],
  },
]

interface SidebarProps {
  alertCount?: number
  role?: string
  companyName?: string
  logoUrl?: string | null
}

export function Sidebar({ alertCount = 0, role, companyName, logoUrl }: SidebarProps) {
  const pathname = usePathname()
  const isManager = role === "OWNER" || role === "ADMIN"

  return (
    <aside className="w-60 bg-slate-900 flex flex-col border-r border-slate-800 shrink-0 h-full print:hidden">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={companyName ?? "Logo"}
              className="w-8 h-8 rounded-lg object-contain bg-white/10 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Syringe className="w-4 h-4 text-blue-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-tight truncate">
              {companyName ?? "Poultry Vet"}
            </p>
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
              {section.items.filter((item) => !(item as any).adminOnly || isManager).map((item) => {
                const Icon = item.icon
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(item.href + "/")
                const badge = item.alert ? alertCount : 0

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
                      <span className="flex-1 min-w-0 truncate">{item.label}</span>
                      {badge > 0 && (
                        <span className="shrink-0 min-w-[1.2rem] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-slate-800">
        <p className="text-[11px] text-slate-600 text-center">Poultry Vet System · v1.0</p>
      </div>
    </aside>
  )
}

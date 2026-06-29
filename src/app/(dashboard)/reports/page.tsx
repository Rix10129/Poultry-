import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  TrendingUp, ShoppingCart, Package, Users, Scale, ArrowRight,
  Clock, Wallet, FileText,
} from "lucide-react"

export const metadata = { title: "Reports" }

const REPORT_CARDS = [
  {
    title: "Sales Report",
    description: "Date-wise and customer-wise sales summary with payment status.",
    href: "/reports/sales",
    icon: TrendingUp,
    color: "bg-blue-50 text-blue-600 border-blue-200",
  },
  {
    title: "Purchase Report",
    description: "Supplier-wise purchase totals and order history.",
    href: "/reports/purchases",
    icon: ShoppingCart,
    color: "bg-purple-50 text-purple-600 border-purple-200",
  },
  {
    title: "Stock Valuation",
    description: "Current stock levels with purchase and sale values per product.",
    href: "/reports/stock",
    icon: Package,
    color: "bg-green-50 text-green-600 border-green-200",
  },
  {
    title: "Customer Recovery",
    description: "Outstanding receivables ranked by balance — identify overdue accounts.",
    href: "/reports/recovery",
    icon: Users,
    color: "bg-orange-50 text-orange-600 border-orange-200",
  },
  {
    title: "Trial Balance",
    description: "All accounts with total debits, credits, and net balance.",
    href: "/reports/trial-balance",
    icon: Scale,
    color: "bg-slate-50 text-slate-600 border-slate-200",
  },
  {
    title: "Aging Report",
    description: "Outstanding receivables bucketed by age: 0–30, 31–60, 61–90, and 90+ days.",
    href: "/reports/aging",
    icon: Clock,
    color: "bg-red-50 text-red-600 border-red-200",
  },
  {
    title: "Collection Report",
    description: "Daily payments collected per salesman — filter by date range.",
    href: "/reports/collection",
    icon: Wallet,
    color: "bg-teal-50 text-teal-600 border-teal-200",
  },
  {
    title: "PDC Register",
    description: "Post-dated cheques — track pending, deposited, and bounced cheques.",
    href: "/accounts/pdc",
    icon: FileText,
    color: "bg-indigo-50 text-indigo-600 border-indigo-200",
  },
]

export default async function ReportsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-slate-500 text-sm mt-0.5">Financial and operational reports for your business</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORT_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex items-start gap-4 bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <div className={`p-3 rounded-xl border ${card.color} shrink-0`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                {card.title}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{card.description}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 shrink-0 mt-0.5 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  )
}

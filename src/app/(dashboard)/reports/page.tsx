import { BarChart3 } from "lucide-react"

export const metadata = { title: "Reports" }

export default function ReportsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-9rem)] text-center px-4">
      <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 mb-4">
        <BarChart3 className="w-10 h-10 text-slate-400" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">Reports &amp; Dashboard</h1>
      <p className="text-slate-500 text-sm mt-2 max-w-md leading-relaxed">
        Sales summary, stock valuation, expiry report, recovery report, top products, and salesman-wise sales.
      </p>
      <span className="mt-5 px-3 py-1.5 text-xs font-medium text-slate-500 rounded-full border border-slate-200">
        Module 8 — Coming soon
      </span>
    </div>
  )
}

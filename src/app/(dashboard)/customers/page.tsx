import { Users } from "lucide-react"

export const metadata = { title: "Customers" }

export default function CustomersPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-9rem)] text-center px-4">
      <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 mb-4">
        <Users className="w-10 h-10 text-slate-400" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">Customers &amp; Ledger</h1>
      <p className="text-slate-500 text-sm mt-2 max-w-md leading-relaxed">
        Customer types (farm, vet shop, sub-dealer), customer ledger, outstanding balance, and recovery tracking.
      </p>
      <span className="mt-5 px-3 py-1.5 text-xs font-medium text-slate-500 rounded-full border border-slate-200">
        Module 6 — Coming soon
      </span>
    </div>
  )
}

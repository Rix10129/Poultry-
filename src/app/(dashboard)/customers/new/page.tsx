import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { CustomerForm } from "@/components/customers/customer-form"

export const metadata = { title: "New Customer" }

export default function NewCustomerPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Customer</h1>
          <p className="text-sm text-slate-500">Add a farm, vet shop, dealer, or retail customer</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <CustomerForm />
      </div>
    </div>
  )
}

import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { SupplierForm } from "@/components/suppliers/supplier-form"

export const metadata = { title: "New Supplier" }

export default function NewSupplierPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/suppliers" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Supplier</h1>
          <p className="text-sm text-slate-500">Add a supplier or distributor</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <SupplierForm />
      </div>
    </div>
  )
}

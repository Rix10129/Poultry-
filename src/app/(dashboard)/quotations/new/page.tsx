import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { QuoteForm } from "@/components/quotations/quote-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "New Quotation" }

export default async function NewQuotationPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [products, customers] = await Promise.all([
    db.product.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, taxRate: true, salePrice: true },
    }),
    db.customer.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/quotations" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Quotation</h1>
          <p className="text-sm text-slate-500">Create a price quote for a customer</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <QuoteForm
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            unit: p.unit,
            taxRate: p.taxRate.toString(),
            salePrice: p.salePrice.toString(),
          }))}
          customers={customers}
        />
      </div>
    </div>
  )
}

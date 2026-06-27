import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ProductForm } from "@/components/inventory/product-form"

export const metadata = { title: "New Product" }

export default async function NewProductPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [categories, suppliers] = await Promise.all([
    db.category.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/inventory" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Product</h1>
          <p className="text-sm text-slate-500">Add a product to your inventory catalog</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <ProductForm categories={categories} suppliers={suppliers} />
      </div>
    </div>
  )
}

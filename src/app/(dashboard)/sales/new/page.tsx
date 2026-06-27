import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { InvoiceForm } from "@/components/sales/invoice-form"

export const metadata = { title: "New Invoice" }

export default async function NewInvoicePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [rawProducts, customers] = await Promise.all([
    db.product.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        taxRate: true,
        salePrice: true,
        batches: {
          where: { quantity: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true,
            quantity: true,
            salePrice: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
  ])

  // Filter to products with at least one available batch, serialize Decimals
  const products = rawProducts
    .filter((p) => p.batches.length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      taxRate: p.taxRate.toString(),
      salePrice: p.salePrice.toString(),
      batches: p.batches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate.toISOString(),
        quantity: b.quantity,
        salePrice: b.salePrice.toString(),
      })),
    }))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/sales" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Invoice</h1>
          <p className="text-sm text-slate-500">Create a sale invoice</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <InvoiceForm products={products} customers={customers} />
      </div>
    </div>
  )
}

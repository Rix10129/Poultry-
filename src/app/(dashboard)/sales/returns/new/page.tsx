import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { SaleReturnForm } from "@/components/sales/sale-return-form"

export const metadata = { title: "New Sale Return" }

interface Props {
  searchParams: Promise<{ invoiceId?: string; customerId?: string }>
}

export default async function NewSaleReturnPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { invoiceId, customerId } = await searchParams

  const [rawProducts, customers] = await Promise.all([
    db.product.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        batches: {
          orderBy: { expiryDate: "asc" },
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true,
            quantity: true,
            initialQuantity: true,
            salePrice: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  // Include all products that have at least one batch (even sold ones)
  const products = rawProducts
    .filter((p) => p.batches.length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      batches: p.batches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate.toISOString(),
        currentQty: b.quantity,
        soldQty: b.initialQuantity - b.quantity,
        salePrice: b.salePrice.toString(),
      })),
    }))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/sales/returns" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Sale Return</h1>
          <p className="text-sm text-slate-500">Record goods returned by a customer</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <SaleReturnForm
          products={products}
          customers={customers}
          defaultInvoiceId={invoiceId}
          defaultCustomerId={customerId}
        />
      </div>
    </div>
  )
}

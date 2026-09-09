import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { InvoiceForm } from "@/components/sales/invoice-form"
import { parseInvoiceDraft, revalidateInvoiceDraft } from "@/lib/invoice-draft"

export const metadata = { title: "New Invoice" }

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const requestedDraftId = (await searchParams).draft
  const userId = (session.user as any).id as string
  const [rawProducts, customers, drafts, requestedDraft] = await Promise.all([
    db.product.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        isActive: true,
        unit: true,
        taxRate: true,
        salePrice: true,
        batches: {
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
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
    db.invoiceDraft.findMany({ where: { companyId, userId }, orderBy: { updatedAt: "desc" }, select: { id: true, data: true, updatedAt: true } }),
    requestedDraftId ? db.invoiceDraft.findFirst({ where: { id: requestedDraftId, companyId, userId } }) : null,
  ])

  // Filter to products with at least one available batch, serialize Decimals
  const products = rawProducts
    .filter((p) => p.isActive && p.batches.some((b) => b.quantity > 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      taxRate: p.taxRate.toString(),
      salePrice: p.salePrice.toString(),
      batches: p.batches.filter((b) => b.quantity > 0).map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate ? b.expiryDate.toISOString() : null,
        quantity: b.quantity,
        salePrice: b.salePrice.toString(),
      })),
    }))

  let initialDraft = null
  let draftWarnings: string[] = []
  if (requestedDraft) {
    try {
      const checked = revalidateInvoiceDraft(parseInvoiceDraft(requestedDraft.data), {
        customers: new Map(customers.map((c) => [c.id, { name: c.name }])),
        products: new Map(rawProducts.map((p) => [p.id, { name: p.name, active: p.isActive, salePrice: Number(p.salePrice), taxRate: Number(p.taxRate) }])),
        batches: new Map(rawProducts.flatMap((p) => p.batches.map((b) => [b.id, { productId: p.id, batchNumber: b.batchNumber, quantity: b.quantity, salePrice: Number(b.salePrice), expiryDate: b.expiryDate }] as const))),
      })
      initialDraft = { id: requestedDraft.id, ...checked.data }
      draftWarnings = checked.warnings
    } catch (error) { draftWarnings = [(error as Error).message] }
  }

  const draftOptions = drafts.map((draft) => {
    const data = draft.data as any
    return { id: draft.id, updatedAt: draft.updatedAt.toISOString(), label: data.customerName || `${data.lines?.length ?? 0} item invoice` }
  })

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
        <InvoiceForm products={products} customers={customers} initialDraft={initialDraft} draftWarnings={draftWarnings} drafts={draftOptions} />
      </div>
    </div>
  )
}

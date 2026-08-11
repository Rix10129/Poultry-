import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { InvoiceForm } from "@/components/sales/invoice-form"

export const metadata = { title: "Edit Invoice" }
export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditInvoicePage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const invoice = await db.saleInvoice.findFirst({
    where: { id, companyId },
    include: {
      items: { include: { product: { select: { name: true, unit: true } }, batch: { select: { batchNumber: true, expiryDate: true } } } },
      payments: { select: { id: true } },
      returns: { select: { id: true } },
    },
  })
  if (!invoice) notFound()
  if (invoice.status !== "POSTED") redirect(`/sales/${id}`)

  const [rawProducts, customers] = await Promise.all([
    db.product.findMany({
      where: { companyId },
      select: {
        id: true, name: true, isActive: true, unit: true, taxRate: true, salePrice: true,
        batches: { orderBy: { expiryDate: "asc" }, select: { id: true, batchNumber: true, expiryDate: true, quantity: true, salePrice: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true } }),
  ])

  // This invoice's own items already deducted stock from their batches when
  // it was created — add that back before showing availability, so editing
  // sees the same headroom the server will re-validate against (it does the
  // same increment before checking the new lines).
  const restoredQtyByBatch = new Map<string, number>()
  for (const item of invoice.items) {
    restoredQtyByBatch.set(item.batchId, (restoredQtyByBatch.get(item.batchId) ?? 0) + item.quantity)
  }

  const products = rawProducts
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
        quantity: b.quantity + (restoredQtyByBatch.get(b.id) ?? 0),
        salePrice: b.salePrice.toString(),
      })),
    }))
  const restoredBatchQty = new Map<string, number>()
  for (const p of products) for (const b of p.batches) restoredBatchQty.set(b.id, b.quantity)

  const addableProducts = products.filter((p, i) => rawProducts[i].isActive && p.batches.some((b) => b.quantity > 0))

  const initialDraft = {
    id: "",
    version: 1 as const,
    customerId: invoice.customerId ?? "",
    customerName: null,
    invoiceDate: invoice.invoiceDate.toISOString().split("T")[0],
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString().split("T")[0] : "",
    paymentMode: invoice.paymentMode,
    paidAmount: invoice.paidAmount.toString(),
    discountAmount: invoice.discountAmount.toString(),
    notes: invoice.notes ?? "",
    lines: invoice.items.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      unit: item.product.unit,
      batchId: item.batchId,
      batchNumber: item.batch.batchNumber,
      expiryDate: item.batch.expiryDate.toISOString(),
      quantity: item.quantity,
      salePrice: Number(item.salePrice),
      discount: Number(item.discount),
      taxRate: Number(item.taxRate),
      isBonus: item.isBonus,
      savedAvailable: item.quantity,
      savedCatalogPrice: Number(item.salePrice),
      maxQty: restoredBatchQty.get(item.batchId) ?? item.quantity,
    })),
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/sales/${id}`} className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Edit Invoice {invoice.invoiceNumber}</h1>
          <p className="text-sm text-slate-500">Changing quantities, prices, or totals will recalculate the ledger to match</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <InvoiceForm
          products={addableProducts}
          customers={customers}
          initialDraft={initialDraft}
          editContext={{
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            hasDependentRecords: invoice.payments.length > 0 || invoice.returns.length > 0,
            walkInCustomerName: invoice.walkInCustomerName,
          }}
        />
      </div>
    </div>
  )
}

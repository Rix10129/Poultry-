import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { InvoiceForm } from "@/components/sales/invoice-form"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
}

type EditableBatch = {
  id: string
  batchNumber: string
  expiryDate: Date
  quantity: number
  salePrice: { toString(): string }
}

type EditableProduct = {
  id: string
  name: string
  unit: string
  taxRate: { toString(): string }
  salePrice: { toString(): string }
  batches: EditableBatch[]
}

type EditableInvoiceItem = {
  productId: string
  batchId: string
  quantity: number
  salePrice: { toString(): string }
  discount: { toString(): string }
  taxRate: { toString(): string }
  product: { name: string; unit: string }
  batch: { batchNumber: string; expiryDate: Date }
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const inv = await db.saleInvoice.findUnique({ where: { id }, select: { invoiceNumber: true } })
  return { title: inv ? `Edit ${inv.invoiceNumber}` : "Edit Invoice" }
}

export default async function EditInvoicePage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const user = session.user as { companyId?: string; role?: string }
  const companyId = user.companyId as string
  const canOverrideSafeguards = user.role === "OWNER" || user.role === "ADMIN"

  const [invoice, rawProducts, customers] = await Promise.all([
    db.saleInvoice.findFirst({
      where: { id, companyId },
      include: {
        items: {
          include: {
            product: { select: { name: true, unit: true } },
            batch: { select: { batchNumber: true, expiryDate: true } },
          },
          orderBy: { id: "asc" },
        },
        payments: { select: { id: true } },
        returns: { select: { id: true } },
      },
    }),
    db.product.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        taxRate: true,
        salePrice: true,
        batches: {
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

  if (!invoice) notFound()

  const restoredByBatch = new Map<string, number>()
  for (const item of invoice.items) {
    restoredByBatch.set(item.batchId, (restoredByBatch.get(item.batchId) ?? 0) + item.quantity)
  }

  const products = rawProducts
    .map((p: EditableProduct) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      taxRate: p.taxRate.toString(),
      salePrice: p.salePrice.toString(),
      batches: p.batches
        .map((b: EditableBatch) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate.toISOString(),
          quantity: b.quantity + (restoredByBatch.get(b.id) ?? 0),
          salePrice: b.salePrice.toString(),
        }))
        .filter((b: { quantity: number }) => b.quantity > 0),
    }))
    .filter((p: { batches: unknown[] }) => p.batches.length > 0)

  const initialInvoice = {
    id: invoice.id,
    customerId: invoice.customerId,
    invoiceDate: invoice.invoiceDate.toISOString().split("T")[0],
    dueDate: invoice.dueDate?.toISOString().split("T")[0] ?? null,
    paymentMode: invoice.paymentMode,
    paidAmount: invoice.paidAmount.toString(),
    discountAmount: invoice.discountAmount.toString(),
    notes: invoice.notes,
    hasDependentRecords: invoice.payments.length > 0 || invoice.returns.length > 0,
    canOverrideSafeguards,
    lines: (invoice.items as EditableInvoiceItem[]).map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      unit: item.product.unit,
      batchId: item.batchId,
      batchNumber: item.batch.batchNumber,
      expiryDate: item.batch.expiryDate.toISOString(),
      quantity: item.quantity,
      salePrice: item.salePrice.toString(),
      discount: item.discount.toString(),
      taxRate: item.taxRate.toString(),
    })),
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/sales/${invoice.id}`} className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Edit {invoice.invoiceNumber}</h1>
          <p className="text-sm text-slate-500">Update invoice lines, payment details, and stock movements</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <InvoiceForm products={products} customers={customers} mode="update" initialInvoice={initialInvoice} />
      </div>
    </div>
  )
}

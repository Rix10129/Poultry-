/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { QuoteForm } from "@/components/quotations/quote-form"

interface Props { params: Promise<{ id: string }> }
export default async function EditQuotationPage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions); if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string
  const [quote, products, customers] = await Promise.all([
    db.quotation.findFirst({ where: { id, companyId }, include: { items: { include: { product: { select: { name: true, unit: true } } } } } }),
    db.product.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, taxRate: true, salePrice: true } }),
    db.customer.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])
  if (!quote) notFound()
  return <div className="max-w-5xl mx-auto space-y-6"><div className="flex items-center gap-3"><Link href={`/quotations/${id}`} className="text-slate-400 hover:text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-bold text-slate-900">Edit Quotation</h1><p className="text-sm text-slate-500">{quote.quoteNumber}</p></div></div><div className="bg-white rounded-xl border border-slate-200 p-6"><QuoteForm products={products.map(p => ({...p, unit: p.unit.toString(), taxRate: p.taxRate.toString(), salePrice: p.salePrice.toString()}))} customers={customers} mode="edit" initialValues={{ id: quote.id, customerId: quote.customerId ?? "", quoteDate: quote.quoteDate.toISOString().slice(0,10), validUntil: quote.validUntil?.toISOString().slice(0,10) ?? "", discountAmount: quote.discountAmount.toString(), notes: quote.notes ?? "", lines: quote.items.map(i => ({ key: i.id, productId: i.productId, productName: i.product.name, unit: i.unit, quantity: i.quantity, salePrice: Number(i.salePrice), discount: Number(i.discount), taxRate: Number(i.taxRate) })) }} /></div></div>
}

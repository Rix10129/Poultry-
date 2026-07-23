/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { InvoiceForm } from "@/components/sales/invoice-form"
interface Props { params: Promise<{ id: string }> }
export default async function EditSalePage({ params }: Props) {
 const { id } = await params; const session = await getServerSession(authOptions); if (!session) redirect("/login")
 const companyId = (session.user as any).companyId as string
 const [invoice, products, customers] = await Promise.all([db.saleInvoice.findFirst({ where: { id, companyId }, include: { items: { include: { product: true, batch: true } } } }), db.product.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" }, include: { batches: { orderBy: { expiryDate: "asc" } } } }), db.customer.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true } })])
 if (!invoice) notFound()
 return <div className="max-w-5xl mx-auto space-y-6"><div className="flex items-center gap-3"><Link href={`/sales/${id}`} className="text-slate-400 hover:text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-bold text-slate-900">Edit Invoice</h1><p className="text-sm text-slate-500">{invoice.invoiceNumber}</p></div></div><div className="bg-white rounded-xl border border-slate-200 p-6"><InvoiceForm products={products.map(p => ({ id: p.id, name: p.name, unit: p.unit.toString(), taxRate: p.taxRate.toString(), salePrice: p.salePrice.toString(), batches: p.batches.map(b => ({ id: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate.toISOString(), quantity: b.quantity + invoice.items.filter(i => i.batchId === b.id).reduce((s,i)=>s+i.quantity,0), salePrice: b.salePrice.toString() })) }))} customers={customers.map(c => ({...c, type: c.type.toString()}))} mode="edit" initialValues={{ id: invoice.id, customerId: invoice.customerId ?? "", invoiceDate: invoice.invoiceDate.toISOString().slice(0,10), dueDate: invoice.dueDate?.toISOString().slice(0,10) ?? "", paymentMode: invoice.paymentMode, paidAmount: invoice.paidAmount.toString(), discountAmount: invoice.discountAmount.toString(), notes: invoice.notes ?? "", lines: invoice.items.map(i => ({ key: i.id, productId: i.productId, productName: i.product.name, unit: i.product.unit.toString(), batchId: i.batchId, batchNumber: i.batch.batchNumber, expiryDate: i.batch.expiryDate.toISOString(), maxQty: i.batch.quantity + i.quantity, quantity: i.quantity, salePrice: Number(i.salePrice), discount: Number(i.discount), taxRate: Number(i.taxRate) })) }} /></div></div>
}

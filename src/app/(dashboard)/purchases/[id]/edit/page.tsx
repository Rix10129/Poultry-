/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { PurchaseForm } from "@/components/purchases/purchase-form"
interface Props { params: Promise<{ id: string }> }
export default async function EditPurchasePage({ params }: Props) {
 const { id } = await params; const session = await getServerSession(authOptions); if (!session) redirect("/login")
 const user = session.user as any; if (user.role !== "OWNER" && user.role !== "ADMIN") redirect(`/purchases/${id}`)
 const companyId = user.companyId as string
 const [po, products, suppliers] = await Promise.all([db.purchaseOrder.findFirst({ where: { id, companyId }, include: { items: { include: { product: true, batch: true } } } }), db.product.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true, taxRate: true, purchasePrice: true, salePrice: true } }), db.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } })])
 if (!po) notFound()
 return <div className="max-w-5xl mx-auto space-y-6"><div className="flex items-center gap-3"><Link href={`/purchases/${id}`} className="text-slate-400 hover:text-slate-600"><ChevronLeft className="h-5 w-5" /></Link><div><h1 className="text-xl font-bold text-slate-900">Edit Purchase</h1><p className="text-sm text-slate-500">{po.poNumber}</p></div></div><div className="bg-white rounded-xl border border-slate-200 p-6"><PurchaseForm products={products.map(p => ({...p, unit: p.unit.toString(), taxRate: p.taxRate.toString(), purchasePrice: p.purchasePrice.toString(), salePrice: p.salePrice.toString()}))} suppliers={suppliers} mode="edit" initialValues={{ id: po.id, supplierId: po.supplierId, orderDate: po.orderDate.toISOString().slice(0,10), paidAmount: po.paidAmount.toString(), discountAmount: po.discountAmount.toString(), notes: po.notes ?? "", lines: po.items.map(i => ({ key: i.id, productId: i.productId, productName: i.product.name, unit: i.product.unit.toString(), batchNumber: i.batch?.batchNumber ?? "", expiryDate: i.batch?.expiryDate.toISOString().slice(0,10) ?? "", manufactureDate: i.batch?.manufactureDate?.toISOString().slice(0,10) ?? "", quantity: i.quantity, purchasePrice: Number(i.purchasePrice), salePrice: Number(i.batch?.salePrice ?? i.product.salePrice), discount: Number(i.discount), taxRate: Number(i.taxRate) })) }} /></div></div>
}

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { SupplierForm } from "@/components/suppliers/supplier-form"
import { deleteSupplier } from "@/app/(dashboard)/suppliers/actions"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const s = await db.supplier.findUnique({ where: { id }, select: { name: true } })
  return { title: `Edit ${s?.name ?? "Supplier"}` }
}

export default async function EditSupplierPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const supplier = await db.supplier.findFirst({ where: { id, companyId } })
  if (!supplier) notFound()

  const serialized = {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    taxNumber: supplier.taxNumber,
    openingBalance: supplier.openingBalance.toString(),
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/suppliers/${id}`} className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Edit Supplier</h1>
          <p className="text-sm text-slate-500">{supplier.name}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <SupplierForm supplier={serialized} />
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-red-700 mb-1">Danger Zone</h2>
        <p className="text-sm text-slate-500 mb-4">
          Deleting a supplier is permanent and will fail if they have linked purchase orders.
        </p>
        <form action={deleteSupplier}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete Supplier
          </button>
        </form>
      </div>
    </div>
  )
}

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { CustomerForm } from "@/components/customers/customer-form"
import { deleteCustomer } from "@/app/(dashboard)/customers/actions"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const c = await db.customer.findUnique({ where: { id }, select: { name: true } })
  return { title: `Edit ${c?.name ?? "Customer"}` }
}

export default async function EditCustomerPage({ params }: Props) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const customer = await db.customer.findFirst({ where: { id, companyId } })
  if (!customer) notFound()

  const serialized = {
    id: customer.id,
    name: customer.name,
    type: customer.type,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    area: customer.area,
    creditLimit: customer.creditLimit.toString(),
    openingBalance: customer.openingBalance.toString(),
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/customers/${id}`} className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Edit Customer</h1>
          <p className="text-sm text-slate-500">{customer.name}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <CustomerForm customer={serialized} />
      </div>

      <div className="rounded-xl border border-red-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-red-700 mb-1">Danger Zone</h2>
        <p className="text-sm text-slate-500 mb-4">
          Deleting a customer is permanent and will fail if they have invoices or payments.
        </p>
        <form action={deleteCustomer}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete Customer
          </button>
        </form>
      </div>
    </div>
  )
}

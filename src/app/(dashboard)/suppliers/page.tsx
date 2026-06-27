import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"

export const metadata = { title: "Suppliers" }

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { q } = await searchParams

  const suppliers = await db.supplier.findMany({
    where: {
      companyId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    include: {
      _count: { select: { purchases: true } },
      purchases: { select: { netAmount: true, paidAmount: true } },
    },
    orderBy: { name: "asc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/suppliers/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Supplier
          </Button>
        </Link>
      </div>

      <form method="GET" className="flex gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name…"
          className="h-9 w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button type="submit" variant="outline" size="sm">Search</Button>
        {q && (
          <Link href="/suppliers">
            <Button variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No suppliers yet</p>
          <p className="text-sm text-slate-400 mt-1">Add a supplier to start recording purchases</p>
          <Link href="/suppliers/new" className="mt-4">
            <Button><Plus className="h-4 w-4" />New Supplier</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Orders</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((s) => {
                const totalNet = s.purchases.reduce(
                  (sum, p) => sum + parseFloat(p.netAmount.toString()),
                  0
                )
                const totalPaid = s.purchases.reduce(
                  (sum, p) => sum + parseFloat(p.paidAmount.toString()),
                  0
                )
                const outstanding =
                  parseFloat(s.openingBalance.toString()) + totalNet - totalPaid

                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/suppliers/${s.id}`}
                        className="font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {s.name}
                      </Link>
                      {s.address && (
                        <p className="text-xs text-slate-400 mt-0.5">{s.address}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{s.email ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {s._count.purchases}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {outstanding > 0.001 ? (
                        <span className="font-semibold text-red-600">
                          {formatCurrency(outstanding)}
                        </span>
                      ) : (
                        <span className="text-green-600">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

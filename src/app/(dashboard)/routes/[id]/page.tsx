import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, MapPin, Users, ClipboardCheck } from "lucide-react"
import { DeleteButton } from "@/components/ui/delete-button"
import { formatDate } from "@/lib/utils"
import { deleteRoute, logVisit, assignCustomerToRoute } from "@/app/(dashboard)/routes/actions"
import { RouteForm } from "@/components/routes/route-form"

export const dynamic = "force-dynamic"

interface Props { params: Promise<{ id: string }> }

export default async function RouteDetailPage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const [route, unassignedCustomers, salesmen] = await Promise.all([
    db.route.findFirst({
      where: { id, companyId },
      include: {
        salesman: { select: { name: true } },
        customers: { orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, address: true } },
        visits: {
          orderBy: { visitDate: "desc" },
          take: 20,
          include: { user: { select: { name: true } } },
        },
      },
    }),
    db.customer.findMany({
      where: { companyId, routeId: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  if (!route) notFound()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/routes" className="text-slate-400 hover:text-slate-600">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-500" />
              {route.name}
            </h1>
            <p className="text-sm text-slate-500">
              {route.salesman ? `Salesman: ${route.salesman.name}` : "No salesman assigned"} ·{" "}
              {route.customers.length} customer{route.customers.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Link href={`/routes/${id}/edit`} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">Edit</Link>
        <DeleteButton
          action={deleteRoute}
          id={id}
          label="Delete Route"
          confirmMessage={`Delete route "${route.name}"? Customers will be unassigned.`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Edit form */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Route Details</h2>
          <RouteForm
            salesmen={salesmen}
            defaultValues={{
              id: route.id,
              name: route.name,
              description: route.description,
              salesmanId: route.salesmanId,
            }}
          />
        </div>

        {/* Log visit */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-green-500" />
            Log a Visit
          </h2>
          <form action={logVisit} className="space-y-3">
            <input type="hidden" name="routeId" value={id} />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
              <textarea
                name="notes"
                rows={3}
                placeholder="Any observations from today's visit…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
            >
              Log Visit Today
            </button>
          </form>

          {/* Recent visits */}
          {route.visits.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Recent Visits</p>
              <ul className="space-y-2">
                {route.visits.slice(0, 5).map((v) => (
                  <li key={v.id} className="flex items-start justify-between text-xs">
                    <div>
                      <p className="font-medium text-slate-700">{formatDate(v.visitDate)}</p>
                      {v.notes && <p className="text-slate-400 mt-0.5">{v.notes}</p>}
                    </div>
                    <span className="text-slate-400 shrink-0 ml-2">{v.user.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Customers on this route */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            Customers on this Route ({route.customers.length})
          </h2>
          {unassignedCustomers.length > 0 && (
            <form action={assignCustomerToRoute} className="flex items-center gap-2">
              <input type="hidden" name="routeId" value={id} />
              <select
                name="customerId"
                className="h-8 rounded-lg border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Add customer…</option>
                {unassignedCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="submit"
                className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                Add
              </button>
            </form>
          )}
        </div>

        {route.customers.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-400">No customers assigned to this route yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Customer</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Phone</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Address</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {route.customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/customers/${c.id}`} className="font-semibold text-blue-600 hover:text-blue-700">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{c.phone ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-500">{c.address ?? "—"}</td>
                  <td className="px-5 py-3">
                    <form action={assignCustomerToRoute}>
                      <input type="hidden" name="customerId" value={c.id} />
                      <input type="hidden" name="routeId" value="" />
                      <button
                        type="submit"
                        className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                        title="Remove from route"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

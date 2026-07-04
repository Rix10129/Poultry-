import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, MapPin, ArrowRight } from "lucide-react"
import { formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Routes" }

export default async function RoutesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const routes = await db.route.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { customers: true, visits: true } },
      visits: { orderBy: { visitDate: "desc" }, take: 1, select: { visitDate: true } },
      salesman: { select: { name: true } },
    },
  })

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Routes</h1>
          <p className="text-slate-500 text-sm mt-0.5">Salesman delivery routes and customer assignments</p>
        </div>
        <Link
          href="/routes/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Route
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {routes.length === 0 ? (
          <div className="py-16 text-center">
            <MapPin className="h-8 w-8 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No routes yet</p>
            <Link href="/routes/new" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
              Create your first route →
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Route</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Salesman</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Customers</th>
                <th className="text-right px-5 py-3 font-medium text-slate-600">Visits</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Last Visit</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {routes.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/routes/${r.id}`} className="font-semibold text-blue-600 hover:text-blue-700">
                      {r.name}
                    </Link>
                    {r.description && <p className="text-xs text-slate-400 mt-0.5">{r.description}</p>}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{r.salesman?.name ?? <span className="italic text-slate-400">Unassigned</span>}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{r._count.customers}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{r._count.visits}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {r.visits[0] ? formatDate(r.visits[0].visitDate) : <span className="italic text-slate-300">Never</span>}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/routes/${r.id}`}>
                      <ArrowRight className="h-4 w-4 text-slate-300 hover:text-slate-500" />
                    </Link>
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

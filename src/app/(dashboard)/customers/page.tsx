import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Pagination } from "@/components/ui/pagination"

export const metadata = { title: "Customers" }

const PAGE_SIZE = 50

const TYPE_LABELS: Record<string, string> = {
  FARM: "Farm",
  VET_SHOP: "Vet Shop",
  SUB_DEALER: "Sub-Dealer",
  RETAIL: "Retail",
}

const TYPE_VARIANTS: Record<string, "info" | "success" | "warning" | "default"> = {
  FARM: "info",
  VET_SHOP: "success",
  SUB_DEALER: "warning",
  RETAIL: "default",
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const { q, type, page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? "1") || 1)

  const where = {
    companyId,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(type ? { type: type as any } : {}),
  }

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        invoices: { select: { netAmount: true, paidAmount: true } },
        _count: { select: { invoices: true } },
      },
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.customer.count({ where }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} customer{total !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/customers/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Customer
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <form method="GET" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name…"
            className="h-9 w-56 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {type && <input type="hidden" name="type" value={type} />}
          <Button type="submit" variant="outline" size="sm">Search</Button>
          {(q || type) && (
            <Link href="/customers">
              <Button variant="ghost" size="sm">Clear</Button>
            </Link>
          )}
        </form>
        <div className="flex gap-1">
          {["", "FARM", "VET_SHOP", "SUB_DEALER", "RETAIL"].map((t) => (
            <Link
              key={t}
              href={t ? `/customers?type=${t}` : "/customers"}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                (type ?? "") === t
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {t ? TYPE_LABELS[t] : "All"}
            </Link>
          ))}
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No customers yet</p>
          <p className="text-sm text-slate-400 mt-1">Add customers to track their ledger and balance</p>
          <Link href="/customers/new" className="mt-4">
            <Button><Plus className="h-4 w-4" />New Customer</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Area</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Phone</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Invoices</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => {
                const totalNet = c.invoices.reduce(
                  (s, inv) => s + parseFloat(inv.netAmount.toString()),
                  0
                )
                const totalPaid = c.invoices.reduce(
                  (s, inv) => s + parseFloat(inv.paidAmount.toString()),
                  0
                )
                const outstanding =
                  parseFloat(c.openingBalance.toString()) + totalNet - totalPaid
                const creditLimit = parseFloat(c.creditLimit.toString())
                const overLimit = creditLimit > 0 && outstanding > creditLimit

                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={TYPE_VARIANTS[c.type] ?? "default"}>
                        {TYPE_LABELS[c.type] ?? c.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.area ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{c._count.invoices}</td>
                    <td className="px-4 py-3 text-right">
                      {outstanding > 0.001 ? (
                        <span className={`font-semibold ${overLimit ? "text-red-700" : "text-red-600"}`}>
                          {formatCurrency(outstanding)}
                          {overLimit && (
                            <span className="ml-1 text-xs text-red-500">(over limit)</span>
                          )}
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
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            baseUrl={`/customers${new URLSearchParams({ ...(q ? { q } : {}), ...(type ? { type } : {}) }).toString() ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(type ? { type } : {}) }).toString()}` : ""}`}
          />
        </div>
      )}
    </div>
  )
}

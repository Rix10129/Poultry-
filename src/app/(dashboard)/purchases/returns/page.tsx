import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const metadata = { title: "Purchase Returns" }

export default async function PurchaseReturnsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const returns = await db.purchaseReturn.findMany({
    where: { companyId },
    include: { supplier: { select: { name: true } } },
    orderBy: { returnDate: "desc" },
    take: 100,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/purchases" className="text-sm text-slate-500 hover:text-slate-700">Purchases</Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-2xl font-bold text-slate-900">Purchase Returns</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{returns.length} return{returns.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/purchases/returns/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Return
          </Button>
        </Link>
      </div>

      {returns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <RotateCcw className="h-10 w-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No purchase returns yet</p>
          <p className="text-sm text-slate-400 mt-1">Create a purchase return when you send goods back to a supplier</p>
          <Link href="/purchases/returns/new" className="mt-4">
            <Button><Plus className="h-4 w-4" />New Return</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Return #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Supplier</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returns.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/purchases/returns/${r.id}`}
                      className="font-mono font-semibold text-blue-600 hover:text-blue-700"
                    >
                      {r.returnNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(r.returnDate)}</td>
                  <td className="px-4 py-3 text-slate-700">{r.supplier.name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(parseFloat(r.totalAmount.toString()))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

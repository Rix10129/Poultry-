import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { RouteForm } from "@/components/routes/route-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "New Route" }

export default async function NewRoutePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const companyId = (session.user as any).companyId as string

  const salesmen = await db.user.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/routes" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Route</h1>
          <p className="text-sm text-slate-500">Create a salesman delivery route</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <RouteForm salesmen={salesmen} />
      </div>
    </div>
  )
}

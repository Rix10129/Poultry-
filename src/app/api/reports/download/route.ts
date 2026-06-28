import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateReport } from "@/lib/excel-report"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as any).companyId as string
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 })

  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30")

  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const from = new Date(to.getTime() - days * 86400_000)
  from.setHours(0, 0, 0, 0)

  const company = await db.company.findUnique({ where: { id: companyId }, select: { name: true } })
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const buffer = await generateReport(companyId, company.name, from, to)
  const filename = `${company.name.replace(/\s+/g, "-")}-report-${to.toLocaleDateString("en-GB").replace(/\//g, "-")}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}

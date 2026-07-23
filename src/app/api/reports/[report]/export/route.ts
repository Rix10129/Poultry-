import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canExportReport, generateOperationalReportCsv } from "@/lib/report-export"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(req: NextRequest, ctx: { params: Promise<{ report: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const actor = session.user as { companyId?: string; role?: string }
  const companyId = actor.companyId as string | undefined
  const role = actor.role as string | undefined
  const { report } = await ctx.params

  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 })
  if (!canExportReport(role, report)) {
    return NextResponse.json({ error: "Report export not allowed for this role" }, { status: 403 })
  }

  const csv = await generateOperationalReportCsv(companyId, report, req.nextUrl.searchParams)
  const dateStr = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report}-report-${dateStr}.csv"`,
    },
  })
}

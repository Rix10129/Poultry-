import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateStockReport } from "@/lib/excel-report"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as { companyId?: string }).companyId
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 })

  const company = await db.company.findUnique({ where: { id: companyId }, select: { name: true } })
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const buffer = await generateStockReport(companyId, company.name)
  const date = new Date().toLocaleDateString("en-GB").replace(/\//g, "-")
  const filename = `${company.name.replace(/\s+/g, "-")}-stock-report-${date}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}

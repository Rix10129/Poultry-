import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  REPORT_TYPES,
  ReportType,
  generateBalanceSheetReport,
  generateCustomerLedgerReport,
  generatePLReport,
  generatePurchaseReport,
  generateRecoveryReport,
  generateSalesReport,
  generateStockReport,
  generateTrialBalanceReport,
} from "@/lib/excel-report"

export const runtime = "nodejs"
export const maxDuration = 30

const MAX_RANGE_DAYS = 366

function parseDateParam(value: string | null, fallback: Date, endOfDay = false) {
  if (!value) return fallback
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function datePart(date: Date) {
  return date.toISOString().slice(0, 10)
}

function validateReportType(type: string | null): ReportType | null {
  if (!type) return "sales"
  return REPORT_TYPES.includes(type as ReportType) ? (type as ReportType) : null
}

function filenameFor(type: ReportType, from: Date, to: Date) {
  return `${type}-report-${datePart(from)}-to-${datePart(to)}.xlsx`
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const companyId = (session.user as { companyId?: string }).companyId
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 })

  const params = req.nextUrl.searchParams
  const type = validateReportType(params.get("type"))
  if (!type) {
    return NextResponse.json(
      { error: `Invalid report type. Allowed types: ${REPORT_TYPES.join(", ")}` },
      { status: 400 },
    )
  }

  const todayEnd = new Date()
  todayEnd.setUTCHours(23, 59, 59, 999)
  const defaultFrom = new Date(todayEnd.getTime() - 30 * 86400_000)
  defaultFrom.setUTCHours(0, 0, 0, 0)

  const from = parseDateParam(params.get("from"), defaultFrom)
  const to = parseDateParam(params.get("to"), todayEnd, true)
  if (!from || !to) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD for from and to." }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: "Invalid date range. from must be before or equal to to." }, { status: 400 })
  }
  const days = Math.ceil((to.getTime() - from.getTime()) / 86400_000)
  if (days > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Invalid date range. Maximum range is ${MAX_RANGE_DAYS} days.` }, { status: 400 })
  }

  const company = await db.company.findUnique({ where: { id: companyId }, select: { name: true } })
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const filters = {
    from,
    to,
    customerId: params.get("customerId") || undefined,
    supplierId: params.get("supplierId") || undefined,
    productId: params.get("productId") || undefined,
    salesmanId: params.get("salesmanId") || undefined,
    routeId: params.get("routeId") || undefined,
    status: params.get("status") || undefined,
  }

  const input = { companyId, companyName: company.name, filters }
  const buffer = await ({
    sales: generateSalesReport,
    stock: generateStockReport,
    "customer-ledger": generateCustomerLedgerReport,
    recovery: generateRecoveryReport,
    "trial-balance": generateTrialBalanceReport,
    purchase: generatePurchaseReport,
    pl: generatePLReport,
    "balance-sheet": generateBalanceSheetReport,
  } satisfies Record<ReportType, typeof generateSalesReport>)[type](input)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filenameFor(type, from, to)}"`,
    },
  })
}

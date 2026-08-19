import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/lib/authorization"
import { db } from "@/lib/db"
import { excelResponse, type ExportColumn } from "@/lib/report-export"
import { buildWideTablePdf, type WideTableColumn } from "@/lib/wide-table-pdf"
import { formatCurrency } from "@/lib/utils"

export const runtime = "nodejs"

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400_000)
}

function ageBucket(days: number): "b0_30" | "b31_60" | "b61_90" | "b90plus" {
  if (days <= 30) return "b0_30"
  if (days <= 60) return "b31_60"
  if (days <= 90) return "b61_90"
  return "b90plus"
}

export async function GET(req: NextRequest) {
  const authorization = await authorize("EXPORT_DATA")
  if (!authorization.ok) return NextResponse.json({ error: authorization.status === 401 ? "Unauthorized" : "Forbidden" }, { status: authorization.status })
  const companyId = authorization.actor.companyId

  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const invoices = await db.saleInvoice.findMany({
    where: { companyId, status: "POSTED", customer: { isNot: null } },
    select: {
      netAmount: true, invoiceDate: true, dueDate: true,
      payments: { where: { status: "POSTED" }, select: { amount: true, discountAmount: true } },
      customer: { select: { id: true, name: true, area: true } },
    },
  })

  type CustomerRow = { id: string; name: string; area: string | null; b0_30: number; b31_60: number; b61_90: number; b90plus: number; total: number; invoiceCount: number }
  const customerMap = new Map<string, CustomerRow>()

  for (const inv of invoices) {
    if (!inv.customer) continue
    const paid = inv.payments.reduce((sum, payment) => sum + Number(payment.amount) + Number(payment.discountAmount), 0)
    const balance = parseFloat(inv.netAmount.toString()) - paid
    if (balance < 0.01) continue
    const refDate = inv.dueDate ?? inv.invoiceDate
    const bucket = ageBucket(daysBetween(refDate, today))
    const existing = customerMap.get(inv.customer.id)
    if (existing) {
      existing[bucket] += balance
      existing.total += balance
      existing.invoiceCount++
    } else {
      customerMap.set(inv.customer.id, {
        id: inv.customer.id, name: inv.customer.name, area: inv.customer.area,
        b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0, total: balance, invoiceCount: 1, [bucket]: balance,
      } as CustomerRow)
    }
  }

  const rows = Array.from(customerMap.values()).sort((a, b) => b.total - a.total)
  const totals = rows.reduce((t, r) => ({
    invoiceCount: t.invoiceCount + r.invoiceCount, b0_30: t.b0_30 + r.b0_30, b31_60: t.b31_60 + r.b31_60,
    b61_90: t.b61_90 + r.b61_90, b90plus: t.b90plus + r.b90plus, total: t.total + r.total,
  }), { invoiceCount: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0, total: 0 })

  if (req.nextUrl.searchParams.get("format") === "pdf") {
    const pdfColumns: WideTableColumn[] = [
      { header: "Customer", key: "name", weight: 22 }, { header: "Area", key: "area", weight: 12 },
      { header: "Inv.", key: "invoiceCount", weight: 6, align: "right" },
      { header: "0–30 Days", key: "b0_30", weight: 12, align: "right" }, { header: "31–60 Days", key: "b31_60", weight: 12, align: "right" },
      { header: "61–90 Days", key: "b61_90", weight: 12, align: "right" }, { header: "90+ Days", key: "b90plus", weight: 12, align: "right" },
      { header: "Total", key: "total", weight: 12, align: "right" },
    ]
    const fmt = (n: number) => n > 0.01 ? formatCurrency(n) : "—"
    const pdfRows = rows.map((r) => ({
      name: r.name, area: r.area ?? "—", invoiceCount: String(r.invoiceCount),
      b0_30: fmt(r.b0_30), b31_60: fmt(r.b31_60), b61_90: fmt(r.b61_90), b90plus: fmt(r.b90plus), total: formatCurrency(r.total),
    }))
    const totalsRow = {
      name: "Grand Total", area: "", invoiceCount: String(totals.invoiceCount),
      b0_30: formatCurrency(totals.b0_30), b31_60: formatCurrency(totals.b31_60), b61_90: formatCurrency(totals.b61_90),
      b90plus: formatCurrency(totals.b90plus), total: formatCurrency(totals.total),
    }
    const pdfBytes = await buildWideTablePdf({
      title: "Aging Report", subtitle: `Outstanding receivables by age, as of today · ${rows.length} customer${rows.length !== 1 ? "s" : ""}`,
      columns: pdfColumns, rows: pdfRows, totalsRow,
    })
    return new Response(new Uint8Array(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="aging-report.pdf"` },
    })
  }

  const excelColumns: ExportColumn[] = [
    { header: "Customer", key: "name", width: 26 }, { header: "Area", key: "area" }, { header: "Invoices", key: "invoiceCount", numeric: true },
    { header: "0-30 Days", key: "b0_30", numeric: true }, { header: "31-60 Days", key: "b31_60", numeric: true },
    { header: "61-90 Days", key: "b61_90", numeric: true }, { header: "90+ Days", key: "b90plus", numeric: true }, { header: "Total", key: "total", numeric: true },
  ]
  const excelRows = rows.map((r) => ({ name: r.name, area: r.area ?? "", invoiceCount: r.invoiceCount, b0_30: r.b0_30, b31_60: r.b31_60, b61_90: r.b61_90, b90plus: r.b90plus, total: r.total }))
  excelRows.push({ name: "TOTAL", area: "", invoiceCount: totals.invoiceCount, b0_30: totals.b0_30, b31_60: totals.b31_60, b61_90: totals.b61_90, b90plus: totals.b90plus, total: totals.total })
  return excelResponse("Aging Report", "aging-report", excelColumns, excelRows)
}

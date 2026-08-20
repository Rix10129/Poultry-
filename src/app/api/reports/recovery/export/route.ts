import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/lib/authorization"
import { db } from "@/lib/db"
import { calculateCustomerBalance } from "@/lib/customer-ledger"
import { excelResponse, type ExportColumn } from "@/lib/report-export"
import { buildWideTablePdf, type WideTableColumn } from "@/lib/wide-table-pdf"
import { formatCurrency } from "@/lib/utils"

export const runtime = "nodejs"

const TYPE_LABELS: Record<string, string> = {
  FARM: "Farm",
  VET_SHOP: "Vet Shop",
  SUB_DEALER: "Sub-Dealer",
  RETAIL: "Retail",
}

export async function GET(req: NextRequest) {
  const authorization = await authorize("EXPORT_DATA")
  if (!authorization.ok) return NextResponse.json({ error: authorization.status === 401 ? "Unauthorized" : "Forbidden" }, { status: authorization.status })
  const companyId = authorization.actor.companyId

  const params = req.nextUrl.searchParams
  const type = params.get("type") || undefined
  const area = params.get("area") || undefined
  const showAll = params.get("all") === "1"

  const customers = await db.customer.findMany({
    where: {
      companyId,
      ...(type ? { type: type as any } : {}),
      ...(area ? { area: { contains: area, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      invoices: { where: { status: "POSTED" }, select: { netAmount: true } },
      payments: { where: { status: "POSTED" }, select: { amount: true, discountAmount: true } },
      saleReturns: { where: { status: "POSTED" }, select: { totalAmount: true } },
    },
  })

  const rows = customers
    .map((c) => {
      const totalInvoiced = c.invoices.reduce((s, i) => s + parseFloat(i.netAmount.toString()), 0)
      const balance = calculateCustomerBalance({ openingBalance: c.openingBalance, invoices: c.invoices, payments: c.payments, returns: c.saleReturns })
      const totalPaid = balance.paid + balance.returned
      return { customer: c, opening: balance.opening, totalInvoiced, totalPaid, outstanding: balance.closingBalance }
    })
    .filter((r) => showAll || r.outstanding > 0.001)
    .sort((a, b) => b.outstanding - a.outstanding)

  const totals = rows.reduce((t, r) => ({
    opening: t.opening + r.opening, invoiced: t.invoiced + r.totalInvoiced, paid: t.paid + r.totalPaid, outstanding: t.outstanding + r.outstanding,
  }), { opening: 0, invoiced: 0, paid: 0, outstanding: 0 })

  if (params.get("format") === "pdf") {
    const pdfColumns: WideTableColumn[] = [
      { header: "Customer", key: "customer", weight: 24 }, { header: "Type", key: "type", weight: 12 }, { header: "Area", key: "area", weight: 12 },
      { header: "Opening", key: "opening", weight: 13, align: "right" }, { header: "Invoiced", key: "invoiced", weight: 13, align: "right" },
      { header: "Paid", key: "paid", weight: 13, align: "right" }, { header: "Outstanding", key: "outstanding", weight: 13, align: "right" },
    ]
    const pdfRows = rows.map((r) => ({
      customer: r.customer.name, type: TYPE_LABELS[r.customer.type] ?? r.customer.type, area: r.customer.area ?? "—",
      opening: r.opening !== 0 ? formatCurrency(r.opening) : "—", invoiced: formatCurrency(r.totalInvoiced),
      paid: formatCurrency(r.totalPaid), outstanding: formatCurrency(r.outstanding),
    }))
    const totalsRow = {
      customer: "Grand Total", type: "", area: "", opening: formatCurrency(totals.opening),
      invoiced: formatCurrency(totals.invoiced), paid: formatCurrency(totals.paid), outstanding: formatCurrency(totals.outstanding),
    }
    const pdfBytes = await buildWideTablePdf({
      title: "Customer Recovery", subtitle: `${rows.length} customer${rows.length !== 1 ? "s" : ""} with outstanding balance`,
      columns: pdfColumns, rows: pdfRows, totalsRow, orientation: "landscape", fontSize: 12, headerFontSize: 10.5,
    })
    return new Response(new Uint8Array(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="customer-recovery-report.pdf"` },
    })
  }

  const excelColumns: ExportColumn[] = [
    { header: "Customer", key: "customer", width: 26 }, { header: "Type", key: "type" }, { header: "Area", key: "area" },
    { header: "Opening", key: "opening", numeric: true }, { header: "Invoiced", key: "invoiced", numeric: true },
    { header: "Paid", key: "paid", numeric: true }, { header: "Outstanding", key: "outstanding", numeric: true },
  ]
  const excelRows = rows.map((r) => ({
    customer: r.customer.name, type: TYPE_LABELS[r.customer.type] ?? r.customer.type, area: r.customer.area ?? "",
    opening: r.opening, invoiced: r.totalInvoiced, paid: r.totalPaid, outstanding: r.outstanding,
  }))
  excelRows.push({ customer: "TOTAL", type: "", area: "", opening: totals.opening, invoiced: totals.invoiced, paid: totals.paid, outstanding: totals.outstanding })
  return excelResponse("Customer Recovery", "customer-recovery-report", excelColumns, excelRows)
}

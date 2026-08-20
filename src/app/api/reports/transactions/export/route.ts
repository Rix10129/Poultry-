import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/lib/authorization"
import { db } from "@/lib/db"
import { excelResponse, type ExportColumn } from "@/lib/report-export"
import { buildWideTablePdf, type WideTableColumn } from "@/lib/wide-table-pdf"
import { matchesPaymentStatus, parseTransactionFilters, reportTotals, transactionWhere } from "@/lib/report-filters"
import { formatCurrency, formatDate } from "@/lib/utils"
import { compactDocumentNumber } from "@/lib/document-number"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const authorization = await authorize("EXPORT_DATA")
  if (!authorization.ok) return NextResponse.json({ error: authorization.status === 401 ? "Unauthorized" : "Forbidden" }, { status: authorization.status })
  const kind = request.nextUrl.searchParams.get("kind")
  if (kind !== "sales" && kind !== "purchases") return NextResponse.json({ error: "Invalid report kind" }, { status: 400 })
  const parsed = parseTransactionFilters(request.nextUrl.searchParams)
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters", issues: parsed.error.flatten() }, { status: 400 })
  const filters = parsed.data
  const where = transactionWhere(filters, authorization.actor.companyId, kind)
  const records = kind === "sales"
    ? await db.saleInvoice.findMany({ where: where as never, include: { customer: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { invoiceDate: "desc" } })
    : await db.purchaseOrder.findMany({ where: where as never, include: { supplier: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { orderDate: "desc" } })
  const filtered = records.filter(row => matchesPaymentStatus(row, filters.paymentStatus))
  const totals = reportTotals(filtered)
  const rows = filtered.map((row: any) => ({
    number: row.invoiceNumber ?? row.poNumber,
    date: (row.invoiceDate ?? row.orderDate).toISOString().slice(0, 10),
    party: row.customer?.name ?? row.supplier?.name ?? "Walk-in",
    user: row.user.name,
    mode: row.paymentMode ?? "—",
    status: row.status,
    paymentStatus: matchesPaymentStatus(row, "PAID") ? "PAID" : matchesPaymentStatus(row, "PARTIAL") ? "PARTIAL" : "UNPAID",
    net: Number(row.netAmount), paid: Number(row.paidAmount), balance: Number(row.netAmount) - Number(row.paidAmount),
  }))
  const title = kind === "sales" ? "Filtered Sales" : "Filtered Purchases"

  if (request.nextUrl.searchParams.get("format") === "pdf") {
    const pdfColumns: WideTableColumn[] = [
      { header: kind === "sales" ? "Invoice #" : "PO #", key: "number", weight: 7 }, { header: "Date", key: "date", weight: 9 },
      { header: kind === "sales" ? "Customer" : "Supplier", key: "party", weight: 12 }, { header: "User", key: "user", weight: 8 },
      { header: "Payment Mode", key: "mode", weight: 10 }, { header: "Status", key: "status", weight: 9 },
      { header: "Pay. Status", key: "paymentStatus", weight: 8 },
      { header: "Net", key: "net", weight: 10, align: "right" }, { header: "Paid", key: "paid", weight: 10, align: "right" },
      { header: "Balance", key: "balance", weight: 10, align: "right" },
    ]
    const pdfRows = rows.map((r) => ({
      number: compactDocumentNumber(r.number), date: formatDate(r.date), party: r.party, user: r.user, mode: r.mode, status: r.status,
      paymentStatus: r.paymentStatus, net: formatCurrency(r.net), paid: formatCurrency(r.paid), balance: formatCurrency(r.balance),
    }))
    const totalsRow = {
      number: "", date: "", party: "", user: "", mode: "", status: "", paymentStatus: "",
      net: formatCurrency(totals.net), paid: formatCurrency(totals.paid), balance: formatCurrency(totals.net - totals.paid),
    }
    const pdfBytes = await buildWideTablePdf({
      title, subtitle: `${filtered.length} record${filtered.length !== 1 ? "s" : ""}`,
      columns: pdfColumns, rows: pdfRows, totalsRow,
    })
    return new Response(new Uint8Array(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${kind}-report.pdf"` },
    })
  }

  const excelColumns: ExportColumn[] = [
    { header: kind === "sales" ? "Invoice #" : "PO #", key: "number" }, { header: "Date", key: "date" },
    { header: kind === "sales" ? "Customer" : "Supplier", key: "party", width: 28 }, { header: "User", key: "user" },
    { header: "Payment Mode", key: "mode" }, { header: "Document Status", key: "status" }, { header: "Payment Status", key: "paymentStatus" },
    { header: "Net", key: "net", numeric: true }, { header: "Paid", key: "paid", numeric: true }, { header: "Balance", key: "balance", numeric: true },
  ]
  rows.push({ number: "TOTAL", date: "", party: "", user: "", mode: "", status: "", paymentStatus: "", net: totals.net, paid: totals.paid, balance: totals.net - totals.paid })
  return excelResponse(title, `${kind}-report`, excelColumns, rows)
}

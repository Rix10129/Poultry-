import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/lib/authorization"
import { db } from "@/lib/db"
import { excelResponse, type ExportColumn } from "@/lib/report-export"
import { buildWideTablePdf, type WideTableColumn } from "@/lib/wide-table-pdf"
import { formatCurrency, formatDate } from "@/lib/utils"
import { compactDocumentNumber } from "@/lib/document-number"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const authorization = await authorize("EXPORT_DATA")
  if (!authorization.ok) return NextResponse.json({ error: authorization.status === 401 ? "Unauthorized" : "Forbidden" }, { status: authorization.status })

  const params = request.nextUrl.searchParams
  const from = params.get("from") || undefined
  const to = params.get("to") || undefined
  const customerId = params.get("customerId") || undefined
  const productId = params.get("productId") || undefined
  const fromDate = from ? new Date(`${from}T00:00:00`) : undefined
  const toDate = to ? new Date(`${to}T23:59:59`) : undefined

  const items = await db.saleInvoiceItem.findMany({
    where: {
      invoice: {
        companyId: authorization.actor.companyId,
        status: "POSTED",
        ...(fromDate || toDate ? { invoiceDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
        ...(customerId ? { customerId } : {}),
      },
      ...(productId ? { productId } : {}),
    },
    include: {
      invoice: { select: { invoiceNumber: true, invoiceDate: true, customer: { select: { name: true } }, walkInCustomerName: true } },
      product: { select: { name: true, unit: true } },
      batch: { select: { batchNumber: true } },
    },
    orderBy: [{ invoice: { invoiceDate: "desc" } }, { invoice: { invoiceNumber: "desc" } }],
  })

  const rows = items.map((item) => ({
    date: item.invoice.invoiceDate.toISOString().slice(0, 10),
    invoiceNumber: item.invoice.invoiceNumber,
    customer: item.invoice.customer?.name ?? item.invoice.walkInCustomerName ?? "Walk-in",
    product: item.product.name,
    batch: item.batch.batchNumber,
    qty: item.quantity, unit: item.product.unit as string, unitPrice: Number(item.salePrice),
    amount: Number(item.totalAmount),
  }))

  const totals = rows.reduce((t, r) => ({ qty: t.qty + r.qty, amount: t.amount + r.amount }), { qty: 0, amount: 0 })

  if (params.get("format") === "pdf") {
    const pdfColumns: WideTableColumn[] = [
      { header: "Date", key: "date", weight: 10 }, { header: "Invoice #", key: "invoiceNumber", weight: 7 },
      { header: "Customer", key: "customer", weight: 18 }, { header: "Product", key: "product", weight: 23 },
      { header: "Batch", key: "batch", weight: 9 }, { header: "Qty", key: "qty", weight: 10, align: "right" },
      { header: "Unit Price", key: "unitPrice", weight: 11, align: "right" }, { header: "Amount", key: "amount", weight: 12, align: "right" },
    ]
    const pdfRows = rows.map((r) => ({
      date: formatDate(r.date), invoiceNumber: compactDocumentNumber(r.invoiceNumber), customer: r.customer, product: r.product,
      batch: r.batch, qty: `${r.qty} ${r.unit}`, unitPrice: formatCurrency(r.unitPrice), amount: formatCurrency(r.amount),
    }))
    const totalsRow = {
      date: "", invoiceNumber: "", customer: "", product: "", batch: "", qty: `${totals.qty}`,
      unitPrice: "", amount: formatCurrency(totals.amount),
    }
    const range = from || to ? `${from ?? "start"} to ${to ?? "today"}` : "All time"
    const pdfBytes = await buildWideTablePdf({
      title: "Sales Report — Detail", subtitle: `${range} · posted invoices only · ${rows.length} line item${rows.length !== 1 ? "s" : ""}`,
      columns: pdfColumns, rows: pdfRows, totalsRow, fontSize: 11, headerFontSize: 9.5,
    })
    return new Response(new Uint8Array(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="sales-detail-report.pdf"` },
    })
  }

  const excelColumns: ExportColumn[] = [
    { header: "Date", key: "date" }, { header: "Invoice #", key: "invoiceNumber" },
    { header: "Customer", key: "customer", width: 24 }, { header: "Product", key: "product", width: 28 },
    { header: "Batch", key: "batch" }, { header: "Qty", key: "qty" },
    { header: "Unit Price", key: "unitPrice", numeric: true }, { header: "Amount", key: "amount", numeric: true },
  ]
  const excelRows = rows.map((r) => ({ date: r.date, invoiceNumber: r.invoiceNumber, customer: r.customer, product: r.product, batch: r.batch, qty: `${r.qty} ${r.unit}`, unitPrice: r.unitPrice, amount: r.amount }))
  excelRows.push({ date: "", invoiceNumber: "TOTAL", customer: "", product: "", batch: "", qty: `${totals.qty}`, unitPrice: 0, amount: totals.amount })
  return excelResponse("Sales Report — Detail", "sales-detail-report", excelColumns, excelRows)
}

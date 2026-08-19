import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/lib/authorization"
import { db } from "@/lib/db"
import { excelResponse, type ExportColumn } from "@/lib/report-export"
import { buildWideTablePdf, type WideTableColumn } from "@/lib/wide-table-pdf"
import { formatCurrency, formatDate } from "@/lib/utils"

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
      batch: { select: { batchNumber: true, purchasePrice: true } },
    },
    orderBy: [{ invoice: { invoiceDate: "desc" } }, { invoice: { invoiceNumber: "desc" } }],
  })

  const rows = items.map((item) => {
    const qty = item.quantity
    const unitPrice = Number(item.salePrice)
    const amount = Number(item.totalAmount)
    const cost = qty * Number(item.batch.purchasePrice)
    const profit = amount - cost
    return {
      date: item.invoice.invoiceDate.toISOString().slice(0, 10),
      invoiceNumber: item.invoice.invoiceNumber,
      customer: item.invoice.customer?.name ?? item.invoice.walkInCustomerName ?? "Walk-in",
      product: item.product.name,
      batch: item.batch.batchNumber,
      qty, unit: item.product.unit as string, unitPrice,
      discountPct: Number(item.discount),
      amount, profit,
    }
  })

  const totals = rows.reduce((t, r) => ({ qty: t.qty + r.qty, amount: t.amount + r.amount, profit: t.profit + r.profit }), { qty: 0, amount: 0, profit: 0 })

  if (params.get("format") === "pdf") {
    const pdfColumns: WideTableColumn[] = [
      { header: "Date", key: "date", weight: 9 }, { header: "Invoice #", key: "invoiceNumber", weight: 10 },
      { header: "Customer", key: "customer", weight: 14 }, { header: "Product", key: "product", weight: 14 },
      { header: "Batch", key: "batch", weight: 6 }, { header: "Qty", key: "qty", weight: 5, align: "right" },
      { header: "UOM", key: "unit", weight: 5 }, { header: "Unit Price", key: "unitPrice", weight: 9, align: "right" },
      { header: "Disc %", key: "discountPct", weight: 6, align: "right" }, { header: "Amount", key: "amount", weight: 11, align: "right" },
      { header: "Profit", key: "profit", weight: 11, align: "right" },
    ]
    const pdfRows = rows.map((r) => ({
      date: formatDate(r.date), invoiceNumber: r.invoiceNumber, customer: r.customer, product: r.product,
      batch: r.batch, qty: String(r.qty), unit: r.unit, unitPrice: formatCurrency(r.unitPrice),
      discountPct: r.discountPct > 0 ? `${r.discountPct}%` : "—", amount: formatCurrency(r.amount), profit: formatCurrency(r.profit),
    }))
    const totalsRow = {
      date: "", invoiceNumber: "", customer: "", product: "", batch: "", qty: String(totals.qty), unit: "",
      unitPrice: "", discountPct: "", amount: formatCurrency(totals.amount), profit: formatCurrency(totals.profit),
    }
    const range = from || to ? `${from ?? "start"} to ${to ?? "today"}` : "All time"
    const pdfBytes = await buildWideTablePdf({
      title: "Sales Report — Detail", subtitle: `${range} · posted invoices only · ${rows.length} line item${rows.length !== 1 ? "s" : ""}`,
      columns: pdfColumns, rows: pdfRows, totalsRow,
    })
    return new Response(new Uint8Array(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="sales-detail-report.pdf"` },
    })
  }

  const excelColumns: ExportColumn[] = [
    { header: "Date", key: "date" }, { header: "Invoice #", key: "invoiceNumber" },
    { header: "Customer", key: "customer", width: 24 }, { header: "Product", key: "product", width: 28 },
    { header: "Batch", key: "batch" }, { header: "Qty", key: "qty", numeric: true }, { header: "UOM", key: "unit" },
    { header: "Unit Price", key: "unitPrice", numeric: true }, { header: "Disc %", key: "discountPct", numeric: true },
    { header: "Amount", key: "amount", numeric: true }, { header: "Profit", key: "profit", numeric: true },
  ]
  rows.push({ date: "", invoiceNumber: "TOTAL", customer: "", product: "", batch: "", qty: totals.qty, unit: "", unitPrice: 0, discountPct: 0, amount: totals.amount, profit: totals.profit })
  return excelResponse("Sales Report — Detail", "sales-detail-report", excelColumns, rows)
}

import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/lib/authorization"
import { db } from "@/lib/db"
import { excelResponse, pdfResponse, type ExportColumn } from "@/lib/report-export"

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
    const subtotal = Number(item.totalAmount)
    const tax = (subtotal * Number(item.taxRate)) / 100
    const lineTotal = subtotal + tax
    const cost = qty * Number(item.batch.purchasePrice)
    const profit = subtotal - cost
    return {
      date: item.invoice.invoiceDate.toISOString().slice(0, 10),
      invoiceNumber: item.invoice.invoiceNumber,
      customer: item.invoice.customer?.name ?? item.invoice.walkInCustomerName ?? "Walk-in",
      product: item.product.name,
      batch: item.batch.batchNumber,
      qty, unit: item.product.unit as string, unitPrice,
      discountPct: Number(item.discount),
      subtotal, tax, lineTotal, profit,
    }
  })

  const totals = rows.reduce((t, r) => ({ qty: t.qty + r.qty, subtotal: t.subtotal + r.subtotal, tax: t.tax + r.tax, lineTotal: t.lineTotal + r.lineTotal, profit: t.profit + r.profit }), { qty: 0, subtotal: 0, tax: 0, lineTotal: 0, profit: 0 })
  rows.push({ date: "", invoiceNumber: "TOTAL", customer: "", product: "", batch: "", qty: totals.qty, unit: "", unitPrice: 0, discountPct: 0, subtotal: totals.subtotal, tax: totals.tax, lineTotal: totals.lineTotal, profit: totals.profit })

  const columns: ExportColumn[] = [
    { header: "Date", key: "date" }, { header: "Invoice #", key: "invoiceNumber" },
    { header: "Customer", key: "customer", width: 24 }, { header: "Product", key: "product", width: 28 },
    { header: "Batch", key: "batch" }, { header: "Qty", key: "qty", numeric: true }, { header: "UOM", key: "unit" },
    { header: "Unit Price", key: "unitPrice", numeric: true }, { header: "Disc %", key: "discountPct", numeric: true },
    { header: "Subtotal", key: "subtotal", numeric: true }, { header: "Tax", key: "tax", numeric: true },
    { header: "Line Total", key: "lineTotal", numeric: true }, { header: "Profit", key: "profit", numeric: true },
  ]

  return params.get("format") === "pdf"
    ? pdfResponse("Sales Report — Detail", "sales-detail-report", columns, rows)
    : excelResponse("Sales Report — Detail", "sales-detail-report", columns, rows)
}

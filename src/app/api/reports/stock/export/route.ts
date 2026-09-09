import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/lib/authorization"
import { db } from "@/lib/db"
import { daysUntilExpiry, formatCurrency, formatDate } from "@/lib/utils"
import { excelResponse, type ExportColumn } from "@/lib/report-export"
import { buildWideTablePdf, type WideTableColumn } from "@/lib/wide-table-pdf"

export const runtime = "nodejs"
export async function GET(req: NextRequest) {
  const authorization = await authorize("EXPORT_DATA")
  if (!authorization.ok) return NextResponse.json({ error: authorization.status === 401 ? "Unauthorized" : "Forbidden" }, { status: authorization.status })
  const categoryId = req.nextUrl.searchParams.get("categoryId") ?? ""
  const showZero = req.nextUrl.searchParams.get("zero") === "1"
  const products = await db.product.findMany({
    where: { companyId: authorization.actor.companyId, isActive: true, ...(categoryId ? { categoryId } : {}) },
    include: { category: { select: { name: true } }, batches: { where: showZero ? {} : { quantity: { gt: 0 } }, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }] } }, orderBy: { name: "asc" },
  })
  const rows = products.flatMap((product: any) => product.batches.map((batch: any) => {
    const days = daysUntilExpiry(batch.expiryDate)
    return { product: product.name, category: product.category?.name ?? "—", batch: batch.batchNumber,
      expiry: batch.expiryDate ? batch.expiryDate.toISOString().slice(0, 10) : null, available: batch.quantity,
      purchaseValue: batch.quantity * Number(batch.purchasePrice), saleValue: batch.quantity * Number(batch.salePrice),
      lowStock: product.reorderLevel >= batch.quantity ? "LOW STOCK" : "OK",
      expiryStatus: days === null ? "—" : days < 0 ? "EXPIRED" : days <= 30 ? "EXPIRING <30D" : "OK" }
  }))
  const totals = rows.reduce((t: { available: number; purchaseValue: number; saleValue: number }, r: any) => ({
    available: t.available + r.available, purchaseValue: t.purchaseValue + r.purchaseValue, saleValue: t.saleValue + r.saleValue,
  }), { available: 0, purchaseValue: 0, saleValue: 0 })

  if (req.nextUrl.searchParams.get("format") === "pdf") {
    const pdfColumns: WideTableColumn[] = [
      { header: "Product", key: "product", weight: 13 }, { header: "Category", key: "category", weight: 10 },
      { header: "Batch / Lot Number", key: "batch", weight: 10 }, { header: "Expiry Date", key: "expiry", weight: 8 }, { header: "Available Qty", key: "available", weight: 11, align: "right" },
      { header: "Purchase Value", key: "purchaseValue", weight: 11, align: "right" }, { header: "Sale Value", key: "saleValue", weight: 11, align: "right" },
      { header: "Low-stock Status", key: "lowStock", weight: 12 }, { header: "Expiry Status", key: "expiryStatus", weight: 11 },
    ]
    const pdfRows = rows.map((r: any) => ({
      product: r.product, category: r.category, batch: r.batch, expiry: r.expiry ? formatDate(r.expiry) : "—",
      available: String(r.available), purchaseValue: formatCurrency(r.purchaseValue), saleValue: formatCurrency(r.saleValue),
      lowStock: r.lowStock, expiryStatus: r.expiryStatus,
    }))
    const totalsRow = {
      product: "Grand Total", category: "", batch: "", expiry: "", available: String(totals.available),
      purchaseValue: formatCurrency(totals.purchaseValue), saleValue: formatCurrency(totals.saleValue), lowStock: "", expiryStatus: "",
    }
    const pdfBytes = await buildWideTablePdf({
      title: "Filtered Stock", subtitle: `${rows.length} batch${rows.length !== 1 ? "es" : ""}`,
      columns: pdfColumns, rows: pdfRows, totalsRow,
    })
    return new Response(new Uint8Array(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="stock-report.pdf"` },
    })
  }

  const columns: ExportColumn[] = [
    { header: "Product", key: "product", width: 30 }, { header: "Category", key: "category" },
    { header: "Batch / Lot Number", key: "batch" }, { header: "Expiry Date", key: "expiry" }, { header: "Available Quantity", key: "available" },
    { header: "Purchase Value", key: "purchaseValue", numeric: true }, { header: "Sale Value", key: "saleValue", numeric: true },
    { header: "Low-stock Status", key: "lowStock" }, { header: "Expiry Status", key: "expiryStatus" },
  ]
  rows.push({
    product: "TOTAL", category: "", batch: "", expiry: "", available: totals.available,
    purchaseValue: totals.purchaseValue, saleValue: totals.saleValue, lowStock: "", expiryStatus: "",
  })
  return excelResponse("Filtered Stock", "stock-report", columns, rows)
}

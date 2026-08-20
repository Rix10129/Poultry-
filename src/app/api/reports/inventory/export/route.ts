import { NextRequest, NextResponse } from "next/server"
import { authorize } from "@/lib/authorization"
import { db } from "@/lib/db"
import { excelResponse, type ExportColumn } from "@/lib/report-export"
import { buildWideTablePdf, type WideTableColumn } from "@/lib/wide-table-pdf"
import { formatCurrency } from "@/lib/utils"
import { Species } from "@prisma/client"

export const runtime = "nodejs"

const SPECIES_LIST = ["BROILER", "LAYER", "CATTLE", "SHEEP", "GOAT", "FISH", "GENERAL"]

function cap(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase()
}

export async function GET(req: NextRequest) {
  const authorization = await authorize("EXPORT_DATA")
  if (!authorization.ok) return NextResponse.json({ error: authorization.status === 401 ? "Unauthorized" : "Forbidden" }, { status: authorization.status })
  const companyId = authorization.actor.companyId

  const params = req.nextUrl.searchParams
  const q = params.get("q") || undefined
  const species = params.get("species") || undefined

  const products = await db.product.findMany({
    where: {
      companyId, isActive: true,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(species && SPECIES_LIST.includes(species) ? { species: species as Species } : {}),
    },
    include: {
      category: { select: { name: true } },
      batches: { select: { quantity: true } },
    },
    orderBy: { name: "asc" },
  })

  const rows = products.map((p) => {
    const stock = p.batches.reduce((s, b) => s + b.quantity, 0)
    const salePrice = Number(p.salePrice)
    const amount = stock * salePrice
    const status = stock === 0 ? "Out of Stock" : stock <= p.reorderLevel ? "Low Stock" : "In Stock"
    return { product: p.name, category: p.category?.name ?? "—", species: cap(p.species), stock, salePrice, amount, status }
  })
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  const totalStock = rows.reduce((s, r) => s + r.stock, 0)

  if (params.get("format") === "pdf") {
    const pdfColumns: WideTableColumn[] = [
      { header: "Product", key: "product", weight: 20 }, { header: "Category", key: "category", weight: 13 },
      { header: "Species", key: "species", weight: 11 }, { header: "Stock", key: "stock", weight: 9, align: "right" },
      { header: "Sale Price", key: "salePrice", weight: 12, align: "right" }, { header: "Amount", key: "amount", weight: 13, align: "right" },
      { header: "Status", key: "status", weight: 12 },
    ]
    const pdfRows = rows.map((r) => ({
      product: r.product, category: r.category, species: r.species, stock: String(r.stock),
      salePrice: formatCurrency(r.salePrice), amount: formatCurrency(r.amount), status: r.status,
    }))
    const totalsRow = {
      product: "Grand Total", category: "", species: "", stock: String(totalStock), salePrice: "", amount: formatCurrency(totalAmount), status: "",
    }
    const pdfBytes = await buildWideTablePdf({
      title: "Inventory", subtitle: `${rows.length} product${rows.length !== 1 ? "s" : ""}`,
      columns: pdfColumns, rows: pdfRows, totalsRow, orientation: "landscape", fontSize: 11, headerFontSize: 9.5,
    })
    return new Response(new Uint8Array(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="inventory-report.pdf"` },
    })
  }

  const excelColumns: ExportColumn[] = [
    { header: "Product", key: "product", width: 28 }, { header: "Category", key: "category" }, { header: "Species", key: "species" },
    { header: "Stock", key: "stock", numeric: true }, { header: "Sale Price", key: "salePrice", numeric: true },
    { header: "Amount", key: "amount", numeric: true }, { header: "Status", key: "status" },
  ]
  const excelRows: Record<string, string | number>[] = rows.map((r) => ({
    product: r.product, category: r.category, species: r.species, stock: r.stock, salePrice: r.salePrice, amount: r.amount, status: r.status,
  }))
  excelRows.push({ product: "TOTAL", category: "", species: "", stock: totalStock, salePrice: 0, amount: totalAmount, status: "" })
  return excelResponse("Inventory", "inventory-report", excelColumns, excelRows)
}

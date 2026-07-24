import ExcelJS from "exceljs"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { daysUntilExpiry } from "@/lib/utils"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const companyId = (session?.user as { companyId?: string } | undefined)?.companyId
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const categoryId = req.nextUrl.searchParams.get("categoryId") ?? ""
  const species = req.nextUrl.searchParams.get("species") ?? ""
  const showZero = req.nextUrl.searchParams.get("zero") === "1"
  const products = await db.product.findMany({
    where: { companyId, isActive: true, ...(categoryId ? { categoryId } : {}), ...(species ? { species: species as never } : {}) },
    include: { category: { select: { name: true } }, batches: { where: showZero ? {} : { quantity: { gt: 0 } }, orderBy: { expiryDate: "asc" } } },
    orderBy: { name: "asc" },
  })
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet("Batch Stock")
  sheet.addRow(["Batch-level Stock Report"])
  sheet.getCell("A1").font = { bold: true, size: 14 }
  const header = sheet.addRow(["Product", "Category", "Species", "Unit", "Batch", "Expiry Date", "Status", "Quantity", "Purchase Price", "Sale Price", "Purchase Value", "Sale Value"])
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } } })
  for (const product of products) for (const batch of product.batches) {
    const days = daysUntilExpiry(batch.expiryDate)
    const status = days < 0 ? "EXPIRED" : days <= 30 ? "EXPIRING <30D" : product.reorderLevel >= batch.quantity ? "LOW STOCK" : "OK"
    sheet.addRow([product.name, product.category?.name ?? "—", product.species, product.unit, batch.batchNumber, batch.expiryDate, status, batch.quantity, Number(batch.purchasePrice), Number(batch.salePrice), batch.quantity * Number(batch.purchasePrice), batch.quantity * Number(batch.salePrice)])
  }
  sheet.columns = [32, 18, 14, 12, 18, 14, 18, 12, 16, 16, 18, 18].map((width) => ({ width }))
  sheet.getColumn(6).numFmt = "dd-mmm-yyyy"
  for (const column of [9, 10, 11, 12]) sheet.getColumn(column).numFmt = '#,##0.00'
  return new NextResponse(new Uint8Array(await book.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="batch-stock-report.xlsx"' } })
}

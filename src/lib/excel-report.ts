import ExcelJS from "exceljs"
import { db } from "@/lib/db"

const NAVY = "FF1E3A5F"
const WHITE = "FFFFFFFF"
const STRIPE = "FFF8FAFC"
const TOTAL_BG = "FFE8F4FD"
const RED = "FFDC2626"
const MUTED = "FF64748B"

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB")
}

function daysUntil(date: Date, now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - start.getTime()) / 86400_000)
}

function stockStatus(quantity: number, reorderLevel: number) {
  if (quantity <= 0) return "OUT OF STOCK"
  if (quantity <= reorderLevel) return "LOW STOCK"
  return "IN STOCK"
}

function expiryStatus(days: number) {
  if (days < 0) return "EXPIRED"
  if (days <= 30) return "EXPIRING <30D"
  if (days <= 90) return "EXPIRING <90D"
  return "OK"
}

function addTitle(sheet: ExcelJS.Worksheet, company: string, title: string) {
  const r1 = sheet.addRow([company])
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: NAVY } }
  const r2 = sheet.addRow([title])
  r2.getCell(1).font = { italic: true, size: 11, color: { argb: MUTED } }
  const r3 = sheet.addRow([`Generated: ${fmtDate(new Date())}`])
  r3.getCell(1).font = { size: 9, color: { argb: MUTED } }
  sheet.addRow([])
}

function addHeaders(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.addRow(headers)
  row.height = 20
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false }
    cell.border = { bottom: { style: "thin", color: { argb: MUTED } } }
  })
}

function styleRow(row: ExcelJS.Row, idx: number) {
  if (idx % 2 === 1) {
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } }
    })
  }
  row.eachCell((cell) => {
    cell.alignment = { vertical: "middle" }
  })
}

function totalRow(sheet: ExcelJS.Worksheet, values: (string | number)[]) {
  const row = sheet.addRow(values)
  row.font = { bold: true, size: 10 }
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } }
  })
}

function setWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w })
}


type DecimalLike = { toString(): string }

type StockProduct = {
  name: string
  species: string
  unit: string
  salePrice: DecimalLike
  reorderLevel: number
  category?: { name: string } | null
  batches: {
    batchNumber: string
    expiryDate: Date
    quantity: number
    purchasePrice: DecimalLike
    salePrice: DecimalLike
  }[]
}

function addStockWorksheet(sheet: ExcelJS.Worksheet, companyName: string, products: StockProduct[]) {
  addTitle(sheet, companyName, "Stock Batch Export")
  addHeaders(sheet, [
    "Product Name",
    "Category/Species",
    "Unit",
    "Batch Number",
    "Expiry Date",
    "Days to Expiry",
    "Available Qty",
    "Purchase Price",
    "Sale Price",
    "Purchase Value",
    "Sale Value",
    "Reorder Level",
    "Stock Status",
    "Expiry Status",
  ])

  let totalQty = 0
  let totalPurchaseValue = 0
  let totalSaleValue = 0
  let rowIndex = 0

  products.forEach((product) => {
    product.batches.forEach((batch) => {
      const quantity = batch.quantity
      const purchasePrice = parseFloat(batch.purchasePrice.toString())
      const salePrice = parseFloat(batch.salePrice.toString())
      const purchaseValue = quantity * purchasePrice
      const saleValue = quantity * salePrice
      const days = daysUntil(batch.expiryDate)
      totalQty += quantity
      totalPurchaseValue += purchaseValue
      totalSaleValue += saleValue

      const row = sheet.addRow([
        product.name,
        [product.category?.name, product.species].filter(Boolean).join(" / ") || "—",
        product.unit,
        batch.batchNumber,
        fmtDate(batch.expiryDate),
        days,
        quantity,
        purchasePrice,
        salePrice,
        purchaseValue,
        saleValue,
        product.reorderLevel,
        stockStatus(quantity, product.reorderLevel),
        expiryStatus(days),
      ])
      styleRow(row, rowIndex)
      if (quantity <= product.reorderLevel) row.getCell(13).font = { bold: true, color: { argb: RED } }
      if (days <= 30) row.getCell(14).font = { bold: true, color: { argb: days < 0 ? RED : "FFCA8A04" } }
      rowIndex += 1
    })
  })

  totalRow(sheet, ["", "", "", "", "", "TOTAL", totalQty, "", "", totalPurchaseValue, totalSaleValue, "", "", ""])
  setWidths(sheet, [30, 22, 12, 18, 14, 14, 14, 14, 12, 16, 14, 14, 16, 16])
}

export async function generateStockReport(companyId: string, companyName: string): Promise<Buffer> {
  const products = await db.product.findMany({
    where: { companyId, isActive: true },
    include: {
      category: { select: { name: true } },
      batches: {
        where: { quantity: { gt: 0 } },
        orderBy: { expiryDate: "asc" },
        select: {
          batchNumber: true,
          expiryDate: true,
          quantity: true,
          purchasePrice: true,
          salePrice: true,
        },
      },
    },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  })

  const wb = new ExcelJS.Workbook()
  wb.creator = "Poultry Vet System"
  wb.created = new Date()

  const sheet = wb.addWorksheet("Stock Batches")
  addStockWorksheet(sheet, companyName, products)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

export async function generateReport(
  companyId: string,
  companyName: string,
  from: Date,
  to: Date,
): Promise<Buffer> {
  const [invoices, purchases, products, customers] = await Promise.all([
    db.saleInvoice.findMany({
      where: { companyId, invoiceDate: { gte: from, lte: to } },
      include: {
        customer: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: { invoiceDate: "asc" },
    }),
    db.purchaseOrder.findMany({
      where: { companyId, orderDate: { gte: from, lte: to } },
      include: { supplier: { select: { name: true } } },
      orderBy: { orderDate: "asc" },
    }),
    db.product.findMany({
      where: { companyId, isActive: true },
      include: {
        batches: {
          where: { quantity: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
          select: {
            batchNumber: true,
            quantity: true,
            expiryDate: true,
            purchasePrice: true,
            salePrice: true,
          },
        },
        category: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({
      where: { companyId },
      include: {
        invoices: { select: { netAmount: true, paidAmount: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { name: "asc" },
    }),
  ])

  const wb = new ExcelJS.Workbook()
  wb.creator = "Poultry Vet System"
  wb.created = new Date()

  // ── Sheet 1: Sales ──────────────────────────────────────────────────────────
  const s1 = wb.addWorksheet("Sales")
  addTitle(s1, companyName, `Sales Report  ${fmtDate(from)} – ${fmtDate(to)}`)
  addHeaders(s1, ["#", "Invoice No.", "Date", "Customer", "Prepared By", "Gross", "Discount", "Net Amount", "Paid", "Balance", "Status"])

  let sNet = 0, sPaid = 0
  invoices.forEach((inv, i) => {
    const net = parseFloat(inv.netAmount.toString())
    const paid = parseFloat(inv.paidAmount.toString())
    const bal = net - paid
    sNet += net; sPaid += paid
    const status = bal <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID"
    const row = s1.addRow([
      i + 1, inv.invoiceNumber, fmtDate(inv.invoiceDate),
      inv.customer?.name ?? "Walk-in", inv.user.name,
      parseFloat(inv.totalAmount.toString()),
      parseFloat(inv.discountAmount.toString()),
      net, paid, bal, status,
    ])
    styleRow(row, i)
    const statusCell = row.getCell(11)
    if (status === "PAID") statusCell.font = { color: { argb: "FF16A34A" } }
    else if (status === "UNPAID") statusCell.font = { color: { argb: RED }, bold: true }
  })
  totalRow(s1, ["", "", "", "", "TOTAL", "", "", sNet, sPaid, sNet - sPaid, ""])
  setWidths(s1, [4, 15, 12, 22, 20, 14, 12, 14, 14, 14, 10])

  // ── Sheet 2: Purchases ──────────────────────────────────────────────────────
  const s2 = wb.addWorksheet("Purchases")
  addTitle(s2, companyName, `Purchase Report  ${fmtDate(from)} – ${fmtDate(to)}`)
  addHeaders(s2, ["#", "PO Number", "Date", "Supplier", "Gross", "Discount", "Net Amount", "Paid", "Payable"])

  let pNet = 0, pPaid = 0
  purchases.forEach((po, i) => {
    const net = parseFloat(po.netAmount.toString())
    const paid = parseFloat(po.paidAmount.toString())
    pNet += net; pPaid += paid
    const row = s2.addRow([
      i + 1, po.poNumber, fmtDate(po.orderDate), po.supplier.name,
      parseFloat(po.totalAmount.toString()),
      parseFloat(po.discountAmount.toString()),
      net, paid, net - paid,
    ])
    styleRow(row, i)
  })
  totalRow(s2, ["", "", "", "TOTAL", "", "", pNet, pPaid, pNet - pPaid])
  setWidths(s2, [4, 15, 12, 24, 14, 12, 14, 14, 14])

  // ── Sheet 3: Inventory ──────────────────────────────────────────────────────
  const s3 = wb.addWorksheet("Inventory")
  addTitle(s3, companyName, "Current Inventory Status")
  addHeaders(s3, ["#", "Product Name", "Category", "Total Stock", "Cost Value", "Sale Value", "Margin", "Expiring <30d", "Expiring <90d", "Alert"])

  const now = new Date()
  const d30 = new Date(now.getTime() + 30 * 86400_000)
  const d90 = new Date(now.getTime() + 90 * 86400_000)

  products.forEach((p, i) => {
    const qty = p.batches.reduce((s, b) => s + b.quantity, 0)
    const costVal = p.batches.reduce((s, b) => s + b.quantity * parseFloat(b.purchasePrice.toString()), 0)
    const saleVal = qty * parseFloat(p.salePrice.toString())
    const exp30 = p.batches.filter(b => b.expiryDate <= d30).reduce((s, b) => s + b.quantity, 0)
    const exp90 = p.batches.filter(b => b.expiryDate > d30 && b.expiryDate <= d90).reduce((s, b) => s + b.quantity, 0)
    const alert = exp30 > 0 ? "⚠ CRITICAL" : exp90 > 0 ? "• EXPIRING" : qty <= p.reorderLevel ? "▼ LOW STOCK" : ""

    const row = s3.addRow([
      i + 1, p.name, p.category?.name ?? "—",
      qty, costVal, saleVal,
      saleVal - costVal,
      exp30 || "", exp90 || "", alert,
    ])
    styleRow(row, i)
    if (exp30 > 0) row.getCell(8).font = { bold: true, color: { argb: RED } }
    if (alert) row.getCell(10).font = { bold: true, color: { argb: exp30 > 0 ? RED : "FFCA8A04" } }
  })
  setWidths(s3, [4, 36, 18, 12, 14, 14, 12, 13, 13, 12])


  // ── Sheet 4: Stock Batches ──────────────────────────────────────────────────
  const stockSheet = wb.addWorksheet("Stock Batches")
  addStockWorksheet(stockSheet, companyName, products)

  // ── Sheet 5: Receivables ────────────────────────────────────────────────────
  const s4 = wb.addWorksheet("Receivables")
  addTitle(s4, companyName, "Customer Outstanding Balances")
  addHeaders(s4, ["#", "Customer", "Type", "Area", "Invoiced", "Paid", "Outstanding", "Credit Limit", "Status"])

  let totalOut = 0
  customers.forEach((c, i) => {
    const invoiced = c.invoices.reduce((s, inv) => s + parseFloat(inv.netAmount.toString()), 0)
    const paidOnInv = c.invoices.reduce((s, inv) => s + parseFloat(inv.paidAmount.toString()), 0)
    const directPay = c.payments.reduce((s, p) => s + parseFloat(p.amount.toString()), 0)
    const outstanding = parseFloat(c.openingBalance.toString()) + invoiced - paidOnInv - directPay
    const creditLimit = parseFloat(c.creditLimit.toString())
    totalOut += Math.max(0, outstanding)

    const status = outstanding <= 0 ? "CLEAR" : outstanding > creditLimit ? "OVER LIMIT" : "WITHIN LIMIT"
    const row = s4.addRow([
      i + 1, c.name, c.type.replace("_", " "), c.area ?? "—",
      invoiced, paidOnInv + directPay, outstanding, creditLimit, status,
    ])
    styleRow(row, i)
    const sc = row.getCell(9)
    if (status === "OVER LIMIT") sc.font = { bold: true, color: { argb: RED } }
    else if (status === "CLEAR") sc.font = { color: { argb: "FF16A34A" } }
  })
  totalRow(s4, ["", "", "", "TOTAL OUTSTANDING", "", "", totalOut, "", ""])
  setWidths(s4, [4, 26, 12, 15, 15, 15, 15, 14, 12])

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

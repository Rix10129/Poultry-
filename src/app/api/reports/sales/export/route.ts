import ExcelJS from "exceljs"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export const runtime = "nodejs"

function dateParam(value: string | null, end = false) {
  if (!value) return undefined
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const companyId = (session?.user as { companyId?: string } | undefined)?.companyId
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const from = dateParam(req.nextUrl.searchParams.get("from"))
  const to = dateParam(req.nextUrl.searchParams.get("to"), true)
  const type = req.nextUrl.searchParams.get("type") ?? ""
  const invoices = await db.saleInvoice.findMany({
    where: {
      companyId,
      ...(from || to ? { invoiceDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(type === "WALK_IN" ? { customerId: null } : type ? { customer: { type: type as never } } : {}),
    },
    include: { customer: { select: { name: true, type: true } }, user: { select: { name: true } } },
    orderBy: { invoiceDate: "desc" },
  })

  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet("Sales")
  sheet.addRow(["Sales Report"])
  sheet.getCell("A1").font = { bold: true, size: 14 }
  const header = sheet.addRow(["Invoice #", "Date", "Customer", "Customer Type", "Prepared By", "Payment Mode", "Net Amount", "Paid", "Balance", "Status"])
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } } })
  let netTotal = 0
  let paidTotal = 0
  invoices.forEach((invoice) => {
    const net = Number(invoice.netAmount)
    const paid = Number(invoice.paidAmount)
    const balance = net - paid
    netTotal += net; paidTotal += paid
    sheet.addRow([invoice.invoiceNumber, invoice.invoiceDate, invoice.customer?.name ?? "Walk-in", invoice.customer?.type ?? "WALK_IN", invoice.user.name, invoice.paymentMode, net, paid, balance, balance <= 0.001 ? "PAID" : paid > 0.001 ? "PARTIAL" : "UNPAID"])
  })
  sheet.addRow(["", "", "", "", "", "TOTAL", netTotal, paidTotal, netTotal - paidTotal, ""])
  sheet.columns = [16, 14, 28, 16, 22, 14, 16, 16, 16, 12].map((width) => ({ width }))
  sheet.getColumn(2).numFmt = "dd-mmm-yyyy"
  for (const column of [7, 8, 9]) sheet.getColumn(column).numFmt = '#,##0.00'

  return new NextResponse(new Uint8Array(await book.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="sales-report.xlsx"' } })
}

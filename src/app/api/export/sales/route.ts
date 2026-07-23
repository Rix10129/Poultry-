import { db } from "@/lib/db"
import { authOptions } from "@/lib/auth"
import { formatCurrency, formatDate } from "@/lib/utils"
import { PaymentMode, Prisma } from "@prisma/client"
import { getServerSession } from "next-auth"

const PAYMENT_MODES = Object.values(PaymentMode)
const STATUS_FILTERS = ["all", "paid", "partial", "unpaid"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

function getDateRange(from?: string | null, to?: string | null) {
  const fromDate = from ? new Date(`${from}T00:00:00`) : undefined
  const toDate = to ? new Date(`${to}T23:59:59.999`) : undefined

  return {
    fromDate: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    toDate: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
  }
}

function matchesStatus(net: number, paid: number, status: StatusFilter) {
  const balance = net - paid

  if (status === "paid") return balance <= 0.001
  if (status === "partial") return balance > 0.001 && paid > 0.001
  if (status === "unpaid") return balance > 0.001 && paid <= 0.001

  return true
}

function csvValue(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response("Unauthorized", { status: 401 })

  const companyId = (session.user as { companyId: string }).companyId
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q") ?? undefined
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const customerId = searchParams.get("customerId") ?? undefined
  const paymentMode = searchParams.get("paymentMode") ?? undefined
  const userId = searchParams.get("userId") ?? undefined
  const selectedPaymentMode = PAYMENT_MODES.includes(paymentMode as PaymentMode)
    ? (paymentMode as PaymentMode)
    : undefined
  const statusParam = searchParams.get("status")
  const selectedStatus = STATUS_FILTERS.includes(statusParam as StatusFilter)
    ? (statusParam as StatusFilter)
    : "all"
  const { fromDate, toDate } = getDateRange(from, to)

  const where: Prisma.SaleInvoiceWhereInput = {
    companyId,
    ...(q ? { invoiceNumber: { contains: q, mode: "insensitive" } } : {}),
    ...(fromDate || toDate
      ? {
          invoiceDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(customerId ? { customerId } : {}),
    ...(selectedPaymentMode ? { paymentMode: selectedPaymentMode } : {}),
    ...(userId ? { userId } : {}),
  }

  const invoices = await db.saleInvoice.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      user: { select: { name: true } },
    },
    orderBy: { invoiceDate: "desc" },
  })

  const rows = invoices
    .filter((inv) =>
      matchesStatus(
        parseFloat(inv.netAmount.toString()),
        parseFloat(inv.paidAmount.toString()),
        selectedStatus
      )
    )
    .map((inv) => {
      const net = parseFloat(inv.netAmount.toString())
      const paid = parseFloat(inv.paidAmount.toString())
      const balance = net - paid
      const status = balance <= 0.001 ? "Paid" : paid > 0.001 ? "Partial" : "Unpaid"

      return [
        inv.invoiceNumber,
        formatDate(inv.invoiceDate),
        inv.customer?.name ?? "Walk-in",
        inv.user.name,
        inv.paymentMode,
        formatCurrency(net),
        formatCurrency(paid),
        formatCurrency(Math.max(0, balance)),
        status,
      ]
    })

  const header = ["Invoice #", "Date", "Customer", "Salesperson", "Mode", "Net Amount", "Paid", "Balance", "Status"]
  const csv = [header, ...rows].map((row) => row.map(csvValue).join(",")).join("\n")
  const date = new Date().toISOString().slice(0, 10)

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-${date}.csv"`,
    },
  })
}

import { z } from "zod"

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""))
const optionalMoney = z.coerce.number().finite().nonnegative().optional()

export const transactionFilterSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  from: optionalDate,
  to: optionalDate,
  partyId: z.string().trim().max(64).optional().default(""),
  userId: z.string().trim().max(64).optional().default(""),
  paymentStatus: z.enum(["PAID", "PARTIAL", "UNPAID", ""]).optional().default(""),
  paymentMode: z.enum(["CASH", "BANK", "CHEQUE", "CREDIT", "EASYPAISA", "JAZZCASH", ""]).optional().default(""),
  status: z.enum(["DRAFT", "POSTED", "CANCELLED", "REVERSED", ""]).optional().default(""),
  minAmount: optionalMoney,
  maxAmount: optionalMoney,
}).superRefine((value, ctx) => {
  if (value.from && value.to && value.from > value.to) ctx.addIssue({ code: "custom", path: ["to"], message: "End date must not precede start date" })
  if (value.minAmount !== undefined && value.maxAmount !== undefined && value.minAmount > value.maxAmount) ctx.addIssue({ code: "custom", path: ["maxAmount"], message: "Maximum amount must not be below minimum amount" })
})

export type TransactionFilters = z.infer<typeof transactionFilterSchema>

export function parseTransactionFilters(params: URLSearchParams | Record<string, string | undefined>) {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) ?? undefined : params[key]
  return transactionFilterSchema.safeParse(Object.fromEntries([
    "q", "from", "to", "partyId", "userId", "paymentStatus", "paymentMode", "status", "minAmount", "maxAmount",
  ].map(key => [key, get(key)]).filter(([, value]) => value !== undefined && value !== "")))
}

export function transactionWhere(filters: TransactionFilters, companyId: string, kind: "sales" | "purchases") {
  const dateField = kind === "sales" ? "invoiceDate" : "orderDate"
  const numberField = kind === "sales" ? "invoiceNumber" : "poNumber"
  const partyField = kind === "sales" ? "customerId" : "supplierId"
  const date = filters.from || filters.to ? {
    ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000`) } : {}),
    ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999`) } : {}),
  } : undefined
  const amount = filters.minAmount !== undefined || filters.maxAmount !== undefined ? {
    ...(filters.minAmount !== undefined ? { gte: filters.minAmount } : {}),
    ...(filters.maxAmount !== undefined ? { lte: filters.maxAmount } : {}),
  } : undefined
  return {
    companyId,
    ...(filters.q ? { [numberField]: { contains: filters.q, mode: "insensitive" as const } } : {}),
    ...(date ? { [dateField]: date } : {}),
    ...(filters.partyId ? { [partyField]: filters.partyId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.paymentMode && kind === "sales" ? { paymentMode: filters.paymentMode } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(amount ? { netAmount: amount } : {}),
    ...(filters.paymentStatus === "UNPAID" ? { paidAmount: { lte: 0 } } : {}),
    // PAID/PARTIAL are applied after retrieval because Prisma cannot portably compare Decimal columns.
  }
}

export function matchesPaymentStatus(row: { netAmount: unknown; paidAmount: unknown }, status: TransactionFilters["paymentStatus"]) {
  const net = Number(row.netAmount), paid = Number(row.paidAmount)
  return !status || (status === "PAID" ? net - paid <= 0.001 : status === "PARTIAL" ? paid > 0.001 && net - paid > 0.001 : paid <= 0.001)
}

export function reportTotals(rows: Array<{ netAmount: unknown; paidAmount: unknown }>) {
  return rows.reduce((total, row) => ({ net: total.net + Number(row.netAmount), paid: total.paid + Number(row.paidAmount) }), { net: 0, paid: 0 })
}

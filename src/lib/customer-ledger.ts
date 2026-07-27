type Numeric = number | string | { toString(): string }

export interface CustomerLedgerInvoice { id?: string; invoiceNumber?: string; invoiceDate: Date; netAmount: Numeric; schemeNotes?: string | null; dueDate?: Date | null }
export interface CustomerLedgerPayment { invoiceId?: string | null; paymentDate: Date; amount: Numeric; paymentMode?: string; reference?: string | null; invoice?: { invoiceNumber: string } | null }
export interface CustomerLedgerReturn { returnNumber?: string; returnDate: Date; totalAmount: Numeric; notes?: string | null }
export interface OpeningBalanceCorrection { createdAt: Date; oldBalance: Numeric; newBalance: Numeric }
export interface CustomerLedgerRow { date: Date; description: string; debit: number; credit: number; balance: number }
export interface CustomerBalanceInput {
  openingBalance: Numeric
  invoices: Array<{ netAmount: Numeric; invoiceDate?: Date }>
  payments: Array<{ amount: Numeric; paymentDate?: Date }>
  returns: Array<{ totalAmount: Numeric; returnDate?: Date }>
  corrections?: OpeningBalanceCorrection[]
  asOf?: Date
}

const amount = (value: Numeric) => Number(value.toString())
const sum = <T>(rows: T[], get: (row: T) => Numeric) => rows.reduce((total, row) => total + amount(get(row)), 0)
const onOrBefore = (date: Date | undefined, asOf?: Date) => !asOf || !date || date <= asOf

/** Converts opening-balance audit records into typed, usable correction events. */
export function parseOpeningBalanceCorrections(rows: Array<{ createdAt: Date; detail: string | null }>): OpeningBalanceCorrection[] {
  return rows.flatMap((row) => {
    try {
      const values = JSON.parse(row.detail ?? "{}")
      const oldBalance = values.oldValues?.openingBalance
      const newBalance = values.newValues?.openingBalance
      if (oldBalance == null || newBalance == null || !Number.isFinite(amount(oldBalance)) || !Number.isFinite(amount(newBalance))) return []
      return [{ createdAt: row.createdAt, oldBalance, newBalance }]
    } catch { return [] }
  }).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

/** Effective opening balance at a date, reconstructed by reversing later corrections. */
export function effectiveOpeningBalance(current: Numeric, corrections: OpeningBalanceCorrection[] = [], asOf?: Date) {
  if (!asOf) return amount(current)
  return corrections.filter((entry) => entry.createdAt > asOf)
    .reduceRight((balance, entry) => balance - (amount(entry.newBalance) - amount(entry.oldBalance)), amount(current))
}

/** The one authoritative formula used by every customer balance surface. */
export function calculateCustomerBalance(input: CustomerBalanceInput) {
  const invoices = input.invoices.filter((row) => onOrBefore(row.invoiceDate, input.asOf))
  const payments = input.payments.filter((row) => onOrBefore(row.paymentDate, input.asOf))
  const returns = input.returns.filter((row) => onOrBefore(row.returnDate, input.asOf))
  const invoiced = sum(invoices, (row) => row.netAmount)
  const paid = sum(payments, (row) => row.amount)
  const returned = sum(returns, (row) => row.totalAmount)
  const opening = effectiveOpeningBalance(input.openingBalance, input.corrections, input.asOf)
  return { opening, invoiced, paid, returned, closingBalance: opening + invoiced - paid - returned }
}

/** Derives the SaleInvoice.paidAmount cache from its payment events. */
export function calculateInvoicePaidAmount(payments: Array<{ amount: Numeric }>) { return sum(payments, (row) => row.amount) }

export function buildCustomerLedger({ customerOpeningBalance, customerCreatedAt, corrections = [], fromDate, toDate, invoices, payments, returns }: {
  customerOpeningBalance: Numeric; customerCreatedAt?: Date; corrections?: OpeningBalanceCorrection[]; fromDate: Date; toDate: Date; invoices: CustomerLedgerInvoice[]; payments: CustomerLedgerPayment[]; returns: CustomerLedgerReturn[]
}) {
  const initialOpening = corrections.reduce((balance, entry) => balance - (amount(entry.newBalance) - amount(entry.oldBalance)), amount(customerOpeningBalance))
  const allRows: Omit<CustomerLedgerRow, "balance">[] = [
    ...(initialOpening ? [{ date: customerCreatedAt ?? new Date(0), description: "Opening Balance", debit: Math.max(0, initialOpening), credit: Math.max(0, -initialOpening) }] : []),
    ...corrections.map((entry) => { const delta = amount(entry.newBalance) - amount(entry.oldBalance); return { date: entry.createdAt, description: "Opening Balance Correction", debit: Math.max(0, delta), credit: Math.max(0, -delta) } }),
    ...invoices.map((invoice) => ({ date: invoice.invoiceDate, description: `Invoice ${invoice.invoiceNumber ?? ""}${invoice.schemeNotes ? ` — Scheme: ${invoice.schemeNotes}` : ""}`.trim(), debit: amount(invoice.netAmount), credit: 0 })),
    ...payments.map((payment) => ({ date: payment.paymentDate, description: `Payment${payment.invoice ? ` (vs. ${payment.invoice.invoiceNumber})` : ""}${payment.paymentMode ? ` — ${payment.paymentMode}` : ""}${payment.reference ? ` #${payment.reference}` : ""}`, debit: 0, credit: amount(payment.amount) })),
    ...returns.map((saleReturn) => ({ date: saleReturn.returnDate, description: `Return ${saleReturn.returnNumber ?? ""}${saleReturn.notes ? ` — ${saleReturn.notes}` : ""}`.trim(), debit: 0, credit: amount(saleReturn.totalAmount) })),
  ]
  const before = allRows.filter((row) => row.date < fromDate)
  const openingBalance = before.reduce((balance, row) => balance + row.debit - row.credit, 0)
  const periodRows = allRows.filter((row) => row.date >= fromDate && row.date <= toDate).sort((a, b) => a.date.getTime() - b.date.getTime())
  let runningBalance = openingBalance
  const rows = periodRows.map((row) => ({ ...row, balance: (runningBalance += row.debit - row.credit) }))
  const totals = { debit: periodRows.reduce((total, row) => total + row.debit, 0), credit: periodRows.reduce((total, row) => total + row.credit, 0) }
  return { openingBalance, rows, totals, closingBalance: openingBalance + totals.debit - totals.credit }
}

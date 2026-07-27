type Numeric = number | string | { toString(): string }

export interface CustomerLedgerInvoice { id: string; invoiceNumber: string; invoiceDate: Date; netAmount: Numeric; schemeNotes?: string | null }
export interface CustomerLedgerPayment { invoiceId?: string | null; paymentDate: Date; amount: Numeric; paymentMode: string; reference?: string | null; invoice?: { invoiceNumber: string } | null }
export interface CustomerLedgerReturn { returnNumber: string; returnDate: Date; totalAmount: Numeric; notes?: string | null }
export interface OpeningBalanceCorrection { date: Date; oldAmount: Numeric; newAmount: Numeric }
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

/** Effective opening balance at a date, reconstructed by reversing later corrections. */
export function effectiveOpeningBalance(current: Numeric, corrections: OpeningBalanceCorrection[] = [], asOf?: Date) {
  if (!asOf) return amount(current)
  return corrections.filter((entry) => entry.date > asOf)
    .reduceRight((balance, entry) => balance - (amount(entry.newAmount) - amount(entry.oldAmount)), amount(current))
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

export function parseOpeningBalanceCorrections(logs: Array<{ detail: string | null; createdAt: Date }>) {
  const corrections: OpeningBalanceCorrection[] = []
  for (const log of logs) {
    try {
      const detail = JSON.parse(log.detail ?? "{}")
      const oldAmount = detail.oldValues?.openingBalance
      const newAmount = detail.newValues?.openingBalance
      if (oldAmount !== undefined && newAmount !== undefined &&
          Number.isFinite(amount(oldAmount)) && Number.isFinite(amount(newAmount)))
        corrections.push({ date: log.createdAt, oldAmount, newAmount })
    } catch {
      // Ignore malformed legacy audit details; they are not ledger events.
    }
  }
  return corrections
}

export function buildCustomerLedger({ customerOpeningBalance, fromDate, toDate, invoices, payments, returns, corrections = [] }: {
  customerOpeningBalance: Numeric; fromDate: Date; toDate: Date; invoices: CustomerLedgerInvoice[]; payments: CustomerLedgerPayment[]; returns: CustomerLedgerReturn[]; corrections?: OpeningBalanceCorrection[]
}) {
  const originalOpeningBalance = corrections.length ? amount(corrections[0].oldAmount) : amount(customerOpeningBalance)
  const allRows: Omit<CustomerLedgerRow, "balance">[] = [
    ...invoices.map((invoice) => ({ date: invoice.invoiceDate, description: `Invoice ${invoice.invoiceNumber}${invoice.schemeNotes ? ` — Scheme: ${invoice.schemeNotes}` : ""}`, debit: amount(invoice.netAmount), credit: 0 })),
    ...payments.map((payment) => ({ date: payment.paymentDate, description: `Payment${payment.invoice ? ` (vs. ${payment.invoice.invoiceNumber})` : ""} — ${payment.paymentMode}${payment.reference ? ` #${payment.reference}` : ""}`, debit: 0, credit: amount(payment.amount) })),
    ...returns.map((saleReturn) => ({ date: saleReturn.returnDate, description: `Return ${saleReturn.returnNumber}${saleReturn.notes ? ` — ${saleReturn.notes}` : ""}`, debit: 0, credit: amount(saleReturn.totalAmount) })),
    ...corrections.map((correction) => {
      const difference = amount(correction.newAmount) - amount(correction.oldAmount)
      return { date: correction.date, description: "Opening balance correction", debit: Math.max(0, difference), credit: Math.max(0, -difference) }
    }),
  ]
  const openingBalance = allRows.filter((row) => row.date < fromDate).reduce((balance, row) => balance + row.debit - row.credit, originalOpeningBalance)
  const periodRows = allRows.filter((row) => row.date >= fromDate && row.date <= toDate).sort((a, b) => a.date.getTime() - b.date.getTime())
  let runningBalance = openingBalance
  const rows = periodRows.map((row) => ({ ...row, balance: (runningBalance += row.debit - row.credit) }))
  const totals = { debit: periodRows.reduce((total, row) => total + row.debit, 0), credit: periodRows.reduce((total, row) => total + row.credit, 0) }
  return { openingBalance, rows, totals, closingBalance: openingBalance + totals.debit - totals.credit }
}

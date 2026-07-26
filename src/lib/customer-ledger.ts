type Numeric = number | string | { toString(): string }

export interface CustomerLedgerInvoice { id: string; invoiceNumber: string; invoiceDate: Date; netAmount: Numeric; schemeNotes?: string | null }
export interface CustomerLedgerPayment { invoiceId?: string | null; paymentDate: Date; amount: Numeric; paymentMode: string; reference?: string | null; invoice?: { invoiceNumber: string } | null }
export interface CustomerLedgerReturn { returnNumber: string; returnDate: Date; totalAmount: Numeric; notes?: string | null }
export interface CustomerLedgerRow { date: Date; description: string; debit: number; credit: number; balance: number }
export interface CustomerBalanceInput { openingBalance: Numeric; invoices: Array<{ netAmount: Numeric }>; payments: Array<{ amount: Numeric }>; returns: Array<{ totalAmount: Numeric }> }

const amount = (value: Numeric) => Number(value.toString())
const sum = <T>(rows: T[], get: (row: T) => Numeric) => rows.reduce((total, row) => total + amount(get(row)), 0)

/** The one authoritative formula used by every customer balance surface. */
export function calculateCustomerBalance(input: CustomerBalanceInput) {
  const invoiced = sum(input.invoices, (row) => row.netAmount)
  const paid = sum(input.payments, (row) => row.amount)
  const returned = sum(input.returns, (row) => row.totalAmount)
  return { opening: amount(input.openingBalance), invoiced, paid, returned,
    closingBalance: amount(input.openingBalance) + invoiced - paid - returned }
}

/** Derives the SaleInvoice.paidAmount cache from its payment events. */
export function calculateInvoicePaidAmount(payments: Array<{ amount: Numeric }>) {
  return sum(payments, (row) => row.amount)
}

export function buildCustomerLedger({ customerOpeningBalance, fromDate, toDate, invoices, payments, returns }: {
  customerOpeningBalance: Numeric; fromDate: Date; toDate: Date; invoices: CustomerLedgerInvoice[]; payments: CustomerLedgerPayment[]; returns: CustomerLedgerReturn[]
}) {
  const allRows: Omit<CustomerLedgerRow, "balance">[] = [
    ...invoices.map((invoice) => ({ date: invoice.invoiceDate, description: `Invoice ${invoice.invoiceNumber}${invoice.schemeNotes ? ` — Scheme: ${invoice.schemeNotes}` : ""}`, debit: amount(invoice.netAmount), credit: 0 })),
    ...payments.map((payment) => ({ date: payment.paymentDate, description: `Payment${payment.invoice ? ` (vs. ${payment.invoice.invoiceNumber})` : ""} — ${payment.paymentMode}${payment.reference ? ` #${payment.reference}` : ""}`, debit: 0, credit: amount(payment.amount) })),
    ...returns.map((saleReturn) => ({ date: saleReturn.returnDate, description: `Return ${saleReturn.returnNumber}${saleReturn.notes ? ` — ${saleReturn.notes}` : ""}`, debit: 0, credit: amount(saleReturn.totalAmount) })),
  ]
  const openingBalance = allRows.filter((row) => row.date < fromDate).reduce((balance, row) => balance + row.debit - row.credit, amount(customerOpeningBalance))
  const periodRows = allRows.filter((row) => row.date >= fromDate && row.date <= toDate).sort((a, b) => a.date.getTime() - b.date.getTime())
  let runningBalance = openingBalance
  const rows = periodRows.map((row) => ({ ...row, balance: (runningBalance += row.debit - row.credit) }))
  const totals = { debit: periodRows.reduce((total, row) => total + row.debit, 0), credit: periodRows.reduce((total, row) => total + row.credit, 0) }
  return { openingBalance, rows, totals, closingBalance: openingBalance + totals.debit - totals.credit }
}

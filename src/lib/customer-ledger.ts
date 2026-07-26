type Numeric = number | string | { toString(): string }

export interface CustomerLedgerInvoice {
  id: string
  invoiceNumber: string
  invoiceDate: Date
  netAmount: Numeric
  paidAmount: Numeric
  schemeNotes?: string | null
}

export interface CustomerLedgerPayment {
  invoiceId?: string | null
  paymentDate: Date
  amount: Numeric
  paymentMode: string
  reference?: string | null
  invoice?: { invoiceNumber: string } | null
}

export interface CustomerLedgerReturn {
  returnNumber: string
  returnDate: Date
  totalAmount: Numeric
  notes?: string | null
}

export interface CustomerLedgerRow {
  date: Date
  description: string
  debit: number
  credit: number
  balance: number
}

interface BuildCustomerLedgerInput {
  customerOpeningBalance: Numeric
  fromDate: Date
  toDate: Date
  invoices: CustomerLedgerInvoice[]
  payments: CustomerLedgerPayment[]
  returns: CustomerLedgerReturn[]
}

const amount = (value: Numeric) => Number(value.toString())

/**
 * Normalizes every customer credit onto the date it occurred. `paidAmount` is
 * cumulative, so linked CustomerPayment records are removed from it first; the
 * remainder is the receipt entered at invoice creation.
 */
export function buildCustomerLedger({
  customerOpeningBalance,
  fromDate,
  toDate,
  invoices,
  payments,
  returns,
}: BuildCustomerLedgerInput) {
  const linkedPaymentsByInvoice = new Map<string, number>()
  for (const payment of payments) {
    if (payment.invoiceId) {
      linkedPaymentsByInvoice.set(
        payment.invoiceId,
        (linkedPaymentsByInvoice.get(payment.invoiceId) ?? 0) + amount(payment.amount)
      )
    }
  }

  const allRows: Omit<CustomerLedgerRow, "balance">[] = []
  for (const invoice of invoices) {
    allRows.push({
      date: invoice.invoiceDate,
      description: `Invoice ${invoice.invoiceNumber}${invoice.schemeNotes ? ` — Scheme: ${invoice.schemeNotes}` : ""}`,
      debit: amount(invoice.netAmount),
      credit: 0,
    })

    const invoiceTimeReceipt = Math.max(
      0,
      amount(invoice.paidAmount) - (linkedPaymentsByInvoice.get(invoice.id) ?? 0)
    )
    if (invoiceTimeReceipt > 0) {
      allRows.push({
        date: invoice.invoiceDate,
        description: `Receipt with Invoice ${invoice.invoiceNumber}`,
        debit: 0,
        credit: invoiceTimeReceipt,
      })
    }
  }

  for (const payment of payments) {
    allRows.push({
      date: payment.paymentDate,
      description: `Payment${payment.invoice ? ` (vs. ${payment.invoice.invoiceNumber})` : ""} — ${payment.paymentMode}${payment.reference ? ` #${payment.reference}` : ""}`,
      debit: 0,
      credit: amount(payment.amount),
    })
  }
  for (const saleReturn of returns) {
    allRows.push({
      date: saleReturn.returnDate,
      description: `Return ${saleReturn.returnNumber}${saleReturn.notes ? ` — ${saleReturn.notes}` : ""}`,
      debit: 0,
      credit: amount(saleReturn.totalAmount),
    })
  }

  const beforePeriod = allRows.filter((row) => row.date < fromDate)
  const openingBalance = beforePeriod.reduce(
    (balance, row) => balance + row.debit - row.credit,
    amount(customerOpeningBalance)
  )
  const periodRows = allRows
    .filter((row) => row.date >= fromDate && row.date <= toDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  let runningBalance = openingBalance
  const rows = periodRows.map((row) => {
    runningBalance += row.debit - row.credit
    return { ...row, balance: runningBalance }
  })
  const totalDebit = periodRows.reduce((total, row) => total + row.debit, 0)
  const totalCredit = periodRows.reduce((total, row) => total + row.credit, 0)

  return {
    openingBalance,
    rows,
    totals: { debit: totalDebit, credit: totalCredit },
    closingBalance: openingBalance + totalDebit - totalCredit,
  }
}

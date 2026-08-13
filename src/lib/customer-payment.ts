type Numeric = number | string | { toString(): string }

export type InvoiceForPayment = {
  id: string
  companyId: string
  customerId: string | null
  netAmount: Numeric
  status?: string
}

const money = (value: Numeric) => Number(value.toString())

/**
 * Enforces the invoice allocation invariant before a CustomerPayment is
 * inserted. Unallocated customer receipts are intentionally handled elsewhere;
 * they are customer credits and must not silently be attached to an invoice.
 */
export function validateInvoicePayment(input: {
  invoice: InvoiceForPayment | null
  companyId: string
  customerId: string
  amount: Numeric
  discountAmount?: Numeric
  postedPayments: Array<{ amount: Numeric; discountAmount?: Numeric }>
}) {
  const { invoice, companyId, customerId } = input
  if (!invoice || invoice.companyId !== companyId || invoice.customerId !== customerId)
    throw new Error("Invoice does not belong to the selected customer and company")
  if (invoice.status && invoice.status !== "POSTED")
    throw new Error("Payments can only be recorded against a posted invoice")

  const paid = input.postedPayments.reduce((total, payment) => total + money(payment.amount) + money(payment.discountAmount ?? 0), 0)
  const remaining = Math.max(0, money(invoice.netAmount) - paid)
  const requested = money(input.amount) + money(input.discountAmount ?? 0)
  if (requested > remaining + 0.001)
    throw new Error(`Payment exceeds the remaining invoice balance of ${remaining.toFixed(2)}`)

  return { paid, remaining, newPaidAmount: paid + requested }
}

type Numeric = number | string | { toString(): string }

export interface SupplierBalanceInput {
  openingBalance: Numeric
  purchases: Array<{ netAmount: Numeric; paidAmount: Numeric }>
  payments: Array<{ amount: Numeric; isVoided?: boolean }>
  returns: Array<{ totalAmount: Numeric }>
}

const number = (value: Numeric) => Number(value.toString())
const sum = <T,>(rows: T[], value: (row: T) => Numeric) =>
  rows.reduce((total, row) => total + number(value(row)), 0)

/** Authoritative supplier payable formula used by every reporting surface. */
export function calculateSupplierBalance(input: SupplierBalanceInput) {
  const opening = number(input.openingBalance)
  const purchased = sum(input.purchases, (purchase) => purchase.netAmount)
  const purchaseTimePaid = sum(input.purchases, (purchase) => purchase.paidAmount)
  const laterPaid = sum(
    input.payments.filter((payment) => !payment.isVoided),
    (payment) => payment.amount
  )
  const returned = sum(input.returns, (purchaseReturn) => purchaseReturn.totalAmount)

  return {
    opening,
    purchased,
    purchaseTimePaid,
    laterPaid,
    returned,
    totalPaid: purchaseTimePaid + laterPaid,
    closingBalance: opening + purchased - purchaseTimePaid - laterPaid - returned,
  }
}

export function calculatePurchaseBalance(
  purchase: { netAmount: Numeric; paidAmount: Numeric },
  payments: Array<{ amount: Numeric; isVoided?: boolean }>
) {
  const laterPaid = sum(payments.filter((payment) => !payment.isVoided), (payment) => payment.amount)
  return number(purchase.netAmount) - number(purchase.paidAmount) - laterPaid
}

/** Statement totals deliberately delegate to the authoritative balance formula. */
export function buildSupplierStatement(input: SupplierBalanceInput) {
  const summary = calculateSupplierBalance(input)
  return {
    openingBalance: summary.opening,
    debit: summary.purchased,
    credit: summary.totalPaid + summary.returned,
    closingBalance: summary.closingBalance,
  }
}

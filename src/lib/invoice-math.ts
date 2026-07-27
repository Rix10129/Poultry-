/**
 * The one shared formula for a document line's pre-tax contribution, used
 * identically by sale invoices, purchases, and quotations so a change to
 * discount/tax/scheme rules can't drift between the create, edit, and
 * offline-sync code paths.
 *
 * A bonus/free line (isBonus) contributes zero revenue and zero tax — it
 * still deducts stock via the normal per-line quantity, it just doesn't
 * count toward totalAmount/taxAmount/netAmount.
 */
export function lineBase(quantity: number, unitPrice: number, discount: number, isBonus?: boolean): number {
  if (isBonus) return 0
  return quantity * unitPrice * (1 - discount / 100)
}

export type DocumentTotals = { totalAmount: number; taxAmount: number; netAmount: number }

export function calculateDocumentTotals<T extends { quantity: number; discount: number; taxRate: number; isBonus?: boolean }>(
  lines: T[],
  unitPrice: (line: T) => number,
  discountAmount: number
): DocumentTotals {
  let totalAmount = 0
  let taxAmount = 0
  for (const line of lines) {
    const base = lineBase(line.quantity, unitPrice(line), line.discount, line.isBonus)
    totalAmount += base
    taxAmount += (base * line.taxRate) / 100
  }
  const netAmount = Math.max(0, totalAmount - discountAmount + taxAmount)
  return { totalAmount, taxAmount, netAmount }
}

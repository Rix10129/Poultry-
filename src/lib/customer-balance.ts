import type { Prisma, PrismaClient } from "@prisma/client"
import { calculateCustomerBalance } from "@/lib/customer-ledger"

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Fetches the same POSTED invoices/payments/returns every balance surface
 * (customer detail, statement, list, reports, dashboard) reads, and reduces
 * them through the one canonical formula in customer-ledger.ts. Pass the
 * transaction client when the result gates a write in the same transaction
 * (e.g. a credit-limit check) so the read is part of that atomic unit of work.
 */
export async function getCustomerOutstandingBalance(
  db: Db,
  companyId: string,
  customerId: string
): Promise<{ closingBalance: number } | null> {
  const [customer, invoices, payments, returns] = await Promise.all([
    db.customer.findFirst({ where: { id: customerId, companyId }, select: { openingBalance: true } }),
    db.saleInvoice.findMany({ where: { customerId, companyId, status: "POSTED" }, select: { netAmount: true } }),
    db.customerPayment.findMany({ where: { customerId, companyId, status: "POSTED" }, select: { amount: true, discountAmount: true } }),
    db.saleReturn.findMany({ where: { customerId, companyId, status: "POSTED" }, select: { totalAmount: true } }),
  ])
  if (!customer) return null
  return calculateCustomerBalance({ openingBalance: customer.openingBalance, invoices, payments, returns })
}

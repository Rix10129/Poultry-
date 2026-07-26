import { db } from "@/lib/db"
import { NextResponse } from "next/server"
import { calculateSupplierBalance } from "@/lib/supplier-ledger"
import { authorize, forbiddenResponse } from "@/lib/authorization"

export async function GET() {
  const authorization = await authorize("EXPORT_DATA")
  if (!authorization.ok) return forbiddenResponse()
  const actor = authorization.actor

  const companyId = actor.companyId as string

  const [company, customers, suppliers, products, invoices, purchases, expenses, payments, supplierPayments] =
    await Promise.all([
      db.company.findUnique({
        where: { id: companyId },
        select: { name: true, phone: true, email: true, address: true, currency: true },
      }),
      db.customer.findMany({ where: { companyId } }),
      db.supplier.findMany({ where: { companyId }, include: { purchases: { select: { netAmount: true, paidAmount: true } }, payments: { select: { amount: true, isVoided: true } }, purchaseReturns: { select: { totalAmount: true } } } }),
      db.product.findMany({
        where: { companyId },
        include: { batches: { select: { batchNumber: true, quantity: true, expiryDate: true, purchasePrice: true } } },
      }),
      db.saleInvoice.findMany({
        where: { companyId },
        include: { items: { select: { quantity: true, salePrice: true, totalAmount: true, product: { select: { name: true } } } } },
        orderBy: { invoiceDate: "desc" },
      }),
      db.purchaseOrder.findMany({
        where: { companyId },
        include: { items: { select: { quantity: true, purchasePrice: true, product: { select: { name: true } } } } },
        orderBy: { orderDate: "desc" },
      }),
      db.expense.findMany({ where: { companyId }, orderBy: { expenseDate: "desc" } }),
      db.customerPayment.findMany({ where: { companyId }, orderBy: { paymentDate: "desc" } }),
      db.supplierPayment.findMany({ where: { companyId }, orderBy: { paymentDate: "desc" } }),
    ])

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    company,
    customers,
    suppliers: suppliers.map(supplier => ({ ...supplier, ledger: calculateSupplierBalance({ openingBalance: supplier.openingBalance, purchases: supplier.purchases, payments: supplier.payments, returns: supplier.purchaseReturns }) })),
    products,
    invoices,
    purchases,
    expenses,
    payments,
    supplierPayments,
  }

  const dateStr = new Date().toISOString().split("T")[0]

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="poultry-export-${dateStr}.json"`,
    },
  })
}

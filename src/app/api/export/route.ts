import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = session?.user as any
  if (!actor?.companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  if (actor.role !== "OWNER") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 })
  }

  const companyId = actor.companyId as string

  const [company, customers, suppliers, products, invoices, purchases, expenses, payments] =
    await Promise.all([
      db.company.findUnique({
        where: { id: companyId },
        select: { name: true, phone: true, email: true, address: true, currency: true },
      }),
      db.customer.findMany({ where: { companyId } }),
      db.supplier.findMany({ where: { companyId } }),
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
    ])

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    company,
    customers,
    suppliers,
    products,
    invoices,
    purchases,
    expenses,
    payments,
  }

  const dateStr = new Date().toISOString().split("T")[0]

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="poultry-export-${dateStr}.json"`,
    },
  })
}

import { db } from "@/lib/db"
import { getActiveSession } from "@/lib/session"
import { NextResponse } from "next/server"

// Returns the minimal data needed for offline invoice creation.
// Called by the client in the background every time the user is online
// so the data stays fresh in IndexedDB.
export async function GET() {
  const session = await getActiveSession()
  const actor = session?.user as any
  if (!actor?.companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const companyId = actor.companyId as string

  const [customers, products] = await Promise.all([
    db.customer.findMany({
      where: { companyId },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        taxRate: true,
        salePrice: true,
        batches: {
          where: { quantity: { gt: 0 } },
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true,
            quantity: true,
            salePrice: true,
          },
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    }),
  ])

  // Serialize Decimal fields to strings (same shape as InvoiceForm expects)
  const serializedProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    taxRate: p.taxRate.toString(),
    salePrice: p.salePrice.toString(),
    batches: p.batches.map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate ? b.expiryDate.toISOString() : null,
      quantity: b.quantity,
      salePrice: b.salePrice.toString(),
    })),
  }))

  return NextResponse.json(
    { customers, products: serializedProducts },
    {
      headers: {
        // Allow browser to serve stale while revalidating
        "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
      },
    }
  )
}

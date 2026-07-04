import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

// POST /api/import
// Accepts the JSON produced by GET /api/export and re-creates master data
// (customers, suppliers, products + current-stock batches) in the current company.
// Transactional history (invoices, purchases) is not restored because the export
// snapshot omits IDs needed for full remapping.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = session?.user as any
  if (!actor?.companyId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  if (actor.role !== "OWNER") return NextResponse.json({ error: "Owner access required" }, { status: 403 })

  const companyId = actor.companyId as string

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON — make sure you upload the correct backup file." }, { status: 400 })
  }

  if (!payload?.data && !payload?.customers) {
    return NextResponse.json({ error: "Unrecognised backup format. Only backups exported from this system are supported." }, { status: 400 })
  }

  // Both export formats: /api/export wraps in root, /api/cron/backup wraps in data{}
  const src = payload.data ?? payload

  const customers: any[] = Array.isArray(src.customers) ? src.customers : []
  const suppliers: any[] = Array.isArray(src.suppliers) ? src.suppliers : []
  const products: any[] = Array.isArray(src.products) ? src.products : []
  const expenses: any[] = Array.isArray(src.expenses) ? src.expenses : []

  const counts = { customers: 0, suppliers: 0, products: 0, batches: 0, expenses: 0, skipped: 0 }

  // ── Customers ──────────────────────────────────────────────────────────────
  for (const c of customers) {
    if (!c.name) { counts.skipped++; continue }
    const exists = await db.customer.findFirst({
      where: { companyId, name: c.name, phone: c.phone ?? null },
      select: { id: true },
    })
    if (exists) { counts.skipped++; continue }
    await db.customer.create({
      data: {
        companyId,
        name: c.name,
        type: c.type ?? "RETAIL",
        phone: c.phone ?? null,
        email: c.email ?? null,
        address: c.address ?? null,
        area: c.area ?? null,
        creditLimit: c.creditLimit ?? 0,
        openingBalance: c.openingBalance ?? 0,
      },
    })
    counts.customers++
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────
  const supplierIdMap: Record<string, string> = {}
  for (const s of suppliers) {
    if (!s.name) { counts.skipped++; continue }
    const exists = await db.supplier.findFirst({
      where: { companyId, name: s.name },
      select: { id: true },
    })
    if (exists) {
      supplierIdMap[s.id] = exists.id
      counts.skipped++
      continue
    }
    const created = await db.supplier.create({
      data: {
        companyId,
        name: s.name,
        phone: s.phone ?? null,
        email: s.email ?? null,
        address: s.address ?? null,
        taxNumber: s.taxNumber ?? null,
        openingBalance: s.openingBalance ?? 0,
      },
    })
    supplierIdMap[s.id] = created.id
    counts.suppliers++
  }

  // ── Products + Batches ────────────────────────────────────────────────────
  for (const p of products) {
    if (!p.name) { counts.skipped++; continue }

    let productId: string
    const exists = await db.product.findFirst({
      where: { companyId, name: p.name },
      select: { id: true },
    })

    if (exists) {
      productId = exists.id
      counts.skipped++
    } else {
      const mappedSupplierId = p.supplierId ? (supplierIdMap[p.supplierId] ?? null) : null
      const created = await db.product.create({
        data: {
          companyId,
          name: p.name,
          genericName: p.genericName ?? null,
          species: p.species ?? "GENERAL",
          description: p.description ?? null,
          unit: p.unit ?? "PIECE",
          salePrice: p.salePrice ?? 0,
          purchasePrice: p.purchasePrice ?? 0,
          reorderLevel: p.reorderLevel ?? 10,
          taxRate: p.taxRate ?? 0,
          isActive: p.isActive ?? true,
          supplierId: mappedSupplierId,
        },
      })
      productId = created.id
      counts.products++
    }

    // Restore batches with remaining stock > 0
    const batches: any[] = Array.isArray(p.batches) ? p.batches : []
    for (const b of batches) {
      if (!b.batchNumber || (b.quantity ?? 0) <= 0) continue
      const batchExists = await db.productBatch.findFirst({
        where: { companyId, productId, batchNumber: b.batchNumber },
        select: { id: true },
      })
      if (batchExists) continue
      await db.productBatch.create({
        data: {
          companyId,
          productId,
          batchNumber: b.batchNumber,
          expiryDate: new Date(b.expiryDate),
          purchasePrice: b.purchasePrice ?? 0,
          salePrice: b.salePrice ?? p.salePrice ?? 0,
          quantity: b.quantity ?? 0,
          initialQuantity: b.quantity ?? 0,
        },
      })
      counts.batches++
    }
  }

  // ── Expenses ───────────────────────────────────────────────────────────────
  // We need a userId for expenses — use the owner's ID
  for (const e of expenses) {
    if (!e.amount || !e.expenseDate) { counts.skipped++; continue }
    try {
      await db.expense.create({
        data: {
          companyId,
          userId: actor.id,
          category: e.category ?? "OTHER",
          description: e.description ?? "Restored from backup",
          amount: e.amount,
          expenseDate: new Date(e.expenseDate),
          paymentMode: e.paymentMode ?? "CASH",
          reference: e.reference ?? null,
          notes: e.notes ?? null,
        },
      })
      counts.expenses++
    } catch {
      counts.skipped++
    }
  }

  return NextResponse.json({
    ok: true,
    restored: counts,
    message: `Restored ${counts.customers} customers, ${counts.suppliers} suppliers, ${counts.products} products (${counts.batches} batches), ${counts.expenses} expenses. ${counts.skipped} records skipped (already existed or invalid).`,
  })
}

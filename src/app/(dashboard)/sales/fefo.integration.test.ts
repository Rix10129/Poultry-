import assert from "node:assert/strict"
import test from "node:test"

import { db } from "@/lib/db"
import { setAuthorizationSessionResolverForTests } from "@/lib/authorization"
import { createInvoice } from "./actions"

const runDatabaseTests = process.env.RUN_DATABASE_CONCURRENCY_TESTS === "1"

test("the server rejects a sale that skips FEFO order even if the client requests it", {
  skip: runDatabaseTests ? false : "set RUN_DATABASE_CONCURRENCY_TESTS=1 against a migrated test database",
}, async (t) => {
  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `FEFO test ${suffix}` } })
  const user = await db.user.create({ data: {
    companyId: company.id,
    name: "FEFO test user",
    email: `fefo-${suffix}@example.test`,
    password: "not-used-in-test",
    role: "CASHIER",
  } })
  const product = await db.product.create({ data: {
    companyId: company.id,
    name: `FEFO product ${suffix}`,
    salePrice: 100,
    purchasePrice: 80,
  } })
  const earlierBatch = await db.productBatch.create({ data: {
    companyId: company.id,
    productId: product.id,
    batchNumber: `EARLY-${suffix}`,
    expiryDate: new Date("2027-01-01"),
    purchasePrice: 80,
    salePrice: 100,
    quantity: 10,
    initialQuantity: 10,
  } })
  const laterBatch = await db.productBatch.create({ data: {
    companyId: company.id,
    productId: product.id,
    batchNumber: `LATE-${suffix}`,
    expiryDate: new Date("2027-06-01"),
    purchasePrice: 80,
    salePrice: 100,
    quantity: 10,
    initialQuantity: 10,
  } })

  setAuthorizationSessionResolverForTests(async () => ({
    user: { id: user.id, companyId: company.id, role: "CASHIER" },
  }))
  t.after(() => setAuthorizationSessionResolverForTests())

  try {
    const form = new FormData()
    form.set("paymentMode", "CASH")
    form.set("paidAmount", "100")
    form.set("linesJson", JSON.stringify([
      { productId: product.id, batchId: laterBatch.id, quantity: 1, salePrice: 100, discount: 0, taxRate: 0 },
    ]))

    const result = await createInvoice(null, form)

    assert.ok(result?.error, "expected the out-of-order batch selection to be rejected")
    assert.match(result!.error, /skips FEFO order/)

    // Stock must be untouched — the whole transaction should have rolled back.
    const [earlyAfter, lateAfter] = await Promise.all([
      db.productBatch.findUniqueOrThrow({ where: { id: earlierBatch.id } }),
      db.productBatch.findUniqueOrThrow({ where: { id: laterBatch.id } }),
    ])
    assert.equal(earlyAfter.quantity, 10)
    assert.equal(lateAfter.quantity, 10)
  } finally {
    await db.stockMovement.deleteMany({ where: { companyId: company.id } })
    await db.productBatch.deleteMany({ where: { companyId: company.id } })
    await db.product.deleteMany({ where: { companyId: company.id } })
    await db.user.deleteMany({ where: { companyId: company.id } })
    await db.company.delete({ where: { id: company.id } })
  }
})

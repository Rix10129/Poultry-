import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { db } from "@/lib/db"
import { setAuthorizationSessionResolverForTests } from "@/lib/authorization"

const runDatabaseTests = process.env.RUN_DATABASE_CONCURRENCY_TESTS === "1"

test("a scheme/bonus line deducts stock via FEFO but contributes zero revenue", {
  skip: runDatabaseTests ? false : "set RUN_DATABASE_CONCURRENCY_TESTS=1 against a migrated test database",
}, async (t) => {
  // revalidatePath/redirect need a real Next.js request context that doesn't
  // exist under the plain test runner — mock them so the server action's
  // happy path can run to completion the same way authorization.test.ts's
  // forbidden-path tests already do for its error path.
  mock.module("next/cache", { namedExports: { revalidatePath: () => {} } })
  mock.module("next/navigation", {
    namedExports: {
      redirect: (url: string) => {
        const err = new Error("NEXT_REDIRECT") as Error & { digest: string }
        err.digest = `NEXT_REDIRECT;push;${url};307;`
        throw err
      },
    },
  })
  const { createInvoice } = await import("./actions")

  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `Scheme test ${suffix}` } })
  const user = await db.user.create({ data: {
    companyId: company.id, name: "Scheme test user", email: `scheme-${suffix}@example.test`,
    password: "not-used-in-test", role: "CASHIER",
  } })
  const product = await db.product.create({ data: {
    companyId: company.id, name: `Scheme product ${suffix}`, salePrice: 100, purchasePrice: 80,
  } })
  const batch = await db.productBatch.create({ data: {
    companyId: company.id, productId: product.id, batchNumber: `BATCH-${suffix}`,
    expiryDate: new Date("2027-01-01"), purchasePrice: 80, salePrice: 100, quantity: 20, initialQuantity: 20,
  } })

  setAuthorizationSessionResolverForTests(async () => ({
    user: { id: user.id, companyId: company.id, role: "CASHIER" },
  }))
  t.after(() => setAuthorizationSessionResolverForTests())

  t.after(async () => {
    await db.stockMovement.deleteMany({ where: { companyId: company.id } })
    await db.saleInvoiceItem.deleteMany({ where: { invoice: { companyId: company.id } } })
    await db.saleInvoice.deleteMany({ where: { companyId: company.id } })
    await db.journalLine.deleteMany({ where: { journalEntry: { companyId: company.id } } })
    await db.journalEntry.deleteMany({ where: { companyId: company.id } })
    await db.account.deleteMany({ where: { companyId: company.id } })
    await db.productBatch.deleteMany({ where: { companyId: company.id } })
    await db.product.deleteMany({ where: { companyId: company.id } })
    await db.user.deleteMany({ where: { companyId: company.id } })
    await db.company.delete({ where: { id: company.id } })
  })

  const form = new FormData()
  form.set("paymentMode", "CASH")
  form.set("paidAmount", "1000") // 10 paid units * 100 = 1000; the 2 bonus units are free
  form.set("linesJson", JSON.stringify([
    { productId: product.id, batchId: batch.id, quantity: 10, salePrice: 100, discount: 0, taxRate: 0 },
    { productId: product.id, batchId: batch.id, quantity: 2, salePrice: 100, discount: 0, taxRate: 0, isBonus: true },
  ]))

  let redirected = false
  try {
    await createInvoice(null, form)
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) redirected = true
    else throw e
  }
  assert.ok(redirected, "expected createInvoice to succeed and redirect")

  const invoice = await db.saleInvoice.findFirstOrThrow({
    where: { companyId: company.id },
    include: { items: true },
  })

  // 12 units left the batch (10 sold + 2 given away), but only the 10 sold count as revenue.
  assert.equal(invoice.items.length, 2)
  assert.equal(invoice.totalAmount.toString(), "1000")
  assert.equal(invoice.netAmount.toString(), "1000")

  const bonusItem = invoice.items.find(i => i.isBonus)!
  assert.equal(bonusItem.totalAmount.toString(), "0")
  assert.equal(bonusItem.quantity, 2)

  const updatedBatch = await db.productBatch.findUniqueOrThrow({ where: { id: batch.id } })
  assert.equal(updatedBatch.quantity, 8) // 20 - 10 - 2

  const movements = await db.stockMovement.findMany({ where: { companyId: company.id, batchId: batch.id } })
  assert.equal(movements.reduce((sum, m) => sum + m.quantity, 0), -12)
})

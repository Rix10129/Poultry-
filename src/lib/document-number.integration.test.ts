import assert from "node:assert/strict"
import test from "node:test"
import { db } from "./db"
import { allocateDocumentNumber } from "./document-number"

const runDatabaseTests = process.env.RUN_DATABASE_CONCURRENCY_TESTS === "1"

test("concurrent document transactions allocate unique sequential numbers", {
  skip: runDatabaseTests ? false : "set RUN_DATABASE_CONCURRENCY_TESTS=1 against a migrated test database",
}, async () => {
  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `Sequence test ${suffix}` } })
  const user = await db.user.create({ data: {
    companyId: company.id,
    name: "Sequence test user",
    email: `sequence-${suffix}@example.test`,
    password: "not-used-in-test",
  } })
  const date = new Date("2026-07-26T00:00:00.000Z")

  try {
    const numbers = await Promise.all(Array.from({ length: 8 }, () =>
      db.$transaction(async tx => {
        const quoteNumber = await allocateDocumentNumber(tx, company.id, "QUOTATION", date)
        const quote = await tx.quotation.create({ data: {
          companyId: company.id,
          userId: user.id,
          quoteNumber,
          quoteDate: date,
          totalAmount: 0,
          netAmount: 0,
        } })
        return quote.quoteNumber
      }),
    ))

    assert.equal(new Set(numbers).size, numbers.length)
    assert.deepEqual(
      [...numbers].sort(),
      Array.from({ length: 8 }, (_, index) => `QT-2026-${String(index + 1).padStart(5, "0")}`),
    )
  } finally {
    await db.company.delete({ where: { id: company.id } })
  }
})

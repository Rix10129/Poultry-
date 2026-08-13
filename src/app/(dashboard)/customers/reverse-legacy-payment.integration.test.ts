import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { db } from "@/lib/db"
import { setAuthorizationSessionResolverForTests } from "@/lib/authorization"

const runDatabaseTests = process.env.RUN_DATABASE_CONCURRENCY_TESTS === "1"

test("reversing a customer payment that has no accounting entry (legacy pre-posting data) voids it instead of failing", {
  skip: runDatabaseTests ? false : "set RUN_DATABASE_CONCURRENCY_TESTS=1 against a migrated test database",
}, async (t) => {
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
  const { recordPayment, reverseCustomerPayment } = await import("./actions")

  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `Legacy payment reversal test ${suffix}` } })
  const user = await db.user.create({ data: {
    companyId: company.id, name: "Legacy payment reversal test user", email: `legacypay-${suffix}@example.test`,
    password: "not-used-in-test", role: "OWNER",
  } })
  const customer = await db.customer.create({ data: {
    companyId: company.id, name: `Legacy payment customer ${suffix}`, type: "RETAIL",
  } })

  setAuthorizationSessionResolverForTests(async () => ({
    user: { id: user.id, companyId: company.id, role: "OWNER" },
  }))
  t.after(() => setAuthorizationSessionResolverForTests())

  t.after(async () => {
    await db.customerPayment.deleteMany({ where: { companyId: company.id } })
    await db.journalLine.deleteMany({ where: { journalEntry: { companyId: company.id } } })
    await db.journalEntry.deleteMany({ where: { companyId: company.id } })
    await db.account.deleteMany({ where: { companyId: company.id } })
    await db.auditLog.deleteMany({ where: { companyId: company.id } })
    await db.customer.deleteMany({ where: { companyId: company.id } })
    await db.user.deleteMany({ where: { companyId: company.id } })
    await db.company.delete({ where: { id: company.id } })
  })

  async function expectRedirect(fn: () => Promise<unknown>) {
    try {
      await fn()
    } catch (e) {
      if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) return
      throw e
    }
    throw new Error("expected a redirect")
  }

  const recordForm = new FormData()
  recordForm.set("customerId", customer.id)
  recordForm.set("amount", "19645")
  recordForm.set("paymentMode", "CASH")
  recordForm.set("notes", "Discount 18,645 + freight 1,000")
  await expectRedirect(() => recordPayment(null, recordForm))

  const payment = await db.customerPayment.findFirstOrThrow({ where: { companyId: company.id } })
  assert.equal(payment.status, "POSTED")

  // Simulate legacy production data: a real payment that predates proper
  // ledger posting, so it has NO JournalEntry at all — exactly the state
  // the client's "Customer payment accounting entry was not found" error
  // surfaced against a real payment on their production database.
  await db.journalLine.deleteMany({ where: { journalEntry: { companyId: company.id } } })
  await db.journalEntry.deleteMany({ where: { companyId: company.id } })

  const reverseForm = new FormData()
  reverseForm.set("paymentId", payment.id)
  reverseForm.set("reason", "test reversal of legacy payment")
  await expectRedirect(() => reverseCustomerPayment(null, reverseForm))

  const reloaded = await db.customerPayment.findUniqueOrThrow({ where: { id: payment.id } })
  assert.equal(reloaded.status, "REVERSED", "the payment must be voidable even with no journal entry to reverse")
  assert.ok(reloaded.reversedAt, "reversedAt must be recorded")
})

import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { db } from "@/lib/db"
import { setAuthorizationSessionResolverForTests } from "@/lib/authorization"

const runDatabaseTests = process.env.RUN_DATABASE_CONCURRENCY_TESTS === "1"

async function journalLineFor(companyId: string, sourceType: string, sourceId: string) {
  return db.journalEntry.findFirst({
    where: { companyId, sourceType, sourceId },
    include: { lines: { include: { debitAccount: true, creditAccount: true } } },
  })
}

test("recording a payment with a discount posts the split correctly and reverses cleanly", {
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
  const company = await db.company.create({ data: { name: `Payment discount test ${suffix}` } })
  const user = await db.user.create({ data: {
    companyId: company.id, name: "Payment discount test user", email: `paydiscount-${suffix}@example.test`,
    password: "not-used-in-test", role: "OWNER",
  } })
  const customer = await db.customer.create({ data: {
    companyId: company.id, name: `Discount customer ${suffix}`, type: "RETAILER",
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

  // Matches the client's real example: Rs 1,000 actual cash + Rs 18,645 discount.
  const recordForm = new FormData()
  recordForm.set("customerId", customer.id)
  recordForm.set("amount", "1000")
  recordForm.set("discountAmount", "18645")
  recordForm.set("paymentMode", "CASH")
  recordForm.set("notes", "Discount 18,645 + freight adjustment")
  await expectRedirect(() => recordPayment(null, recordForm))

  const payment = await db.customerPayment.findFirstOrThrow({ where: { companyId: company.id } })
  assert.equal(payment.amount.toString(), "1000")
  assert.equal(payment.discountAmount.toString(), "18645")

  const entry = await journalLineFor(company.id, "CUSTOMER_RECEIPT", payment.id)
  assert.ok(entry, "expected a CUSTOMER_RECEIPT journal entry")
  const debits = entry!.lines.filter(l => l.debitAccountId)
  const credits = entry!.lines.filter(l => l.creditAccountId)
  assert.equal(debits.length, 2, "expected separate Cash and Discount Allowed debit lines")
  const cashLine = debits.find(l => l.debitAccount!.code === "1000")
  const discountLine = debits.find(l => l.debitAccount!.code === "4100")
  assert.ok(cashLine, "expected a Cash debit line")
  assert.ok(discountLine, "expected a Discount Allowed debit line")
  assert.equal(cashLine!.amount.toString(), "1000")
  assert.equal(discountLine!.amount.toString(), "18645")
  assert.equal(credits.length, 1)
  assert.equal(credits[0].creditAccount!.code, "1100") // Accounts Receivable
  assert.equal(credits[0].amount.toString(), "19645", "AR must be credited for the combined cash + discount")

  // Reversing must undo both lines, not just the cash portion.
  const reverseForm = new FormData()
  reverseForm.set("paymentId", payment.id)
  reverseForm.set("reason", "test reversal of discounted payment")
  await expectRedirect(() => reverseCustomerPayment(null, reverseForm))

  const reloaded = await db.customerPayment.findUniqueOrThrow({ where: { id: payment.id } })
  assert.equal(reloaded.status, "REVERSED")

  const reversalEntry = await db.journalEntry.findFirst({
    where: { companyId: company.id, sourceType: "CUSTOMER_RECEIPT_REVERSAL", sourceId: payment.id },
    include: { lines: true },
  })
  assert.ok(reversalEntry, "expected a reversal entry covering both the cash and discount lines")
  assert.equal(reversalEntry!.totalAmount.toString(), "19645")
})

test("a pure discount/write-off with no cash received is a valid payment", {
  skip: runDatabaseTests ? false : "set RUN_DATABASE_CONCURRENCY_TESTS=1 against a migrated test database",
}, async (t) => {
  const { recordPayment } = await import("./actions")

  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `Pure discount test ${suffix}` } })
  const user = await db.user.create({ data: {
    companyId: company.id, name: "Pure discount test user", email: `puredisc-${suffix}@example.test`,
    password: "not-used-in-test", role: "OWNER",
  } })
  const customer = await db.customer.create({ data: {
    companyId: company.id, name: `Pure discount customer ${suffix}`, type: "RETAILER",
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
  recordForm.set("amount", "0")
  recordForm.set("discountAmount", "19645")
  recordForm.set("paymentMode", "CASH")
  await expectRedirect(() => recordPayment(null, recordForm))

  const payment = await db.customerPayment.findFirstOrThrow({ where: { companyId: company.id } })
  assert.equal(payment.amount.toString(), "0")
  assert.equal(payment.discountAmount.toString(), "19645")

  const entry = await journalLineFor(company.id, "CUSTOMER_RECEIPT", payment.id)
  assert.ok(entry, "expected a CUSTOMER_RECEIPT journal entry")
  const debits = entry!.lines.filter(l => l.debitAccountId)
  assert.equal(debits.length, 1, "a zero-cash payment must not create a spurious zero-amount Cash line")
  assert.equal(debits[0].debitAccount!.code, "4100") // Discount Allowed only
})

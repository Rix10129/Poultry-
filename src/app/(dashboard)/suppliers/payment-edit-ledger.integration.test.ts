import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { db } from "@/lib/db"
import { currentActiveSourceType } from "@/lib/accounting/posting-service"
import { setAuthorizationSessionResolverForTests } from "@/lib/authorization"

const runDatabaseTests = process.env.RUN_DATABASE_CONCURRENCY_TESTS === "1"
const activeCorrectionPattern = /^SUPPLIER_PAYMENT(_CORRECTION_\d+)?$/

test("editing a supplier payment's amount reverses the stale ledger entry and reposts the corrected one", {
  skip: runDatabaseTests ? false : "set RUN_DATABASE_CONCURRENCY_TESTS=1 against a migrated test database",
}, async (t) => {
  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `Supplier payment edit test ${suffix}` } })
  const owner = await db.user.create({ data: {
    companyId: company.id, name: "Supplier payment test owner", email: `suppay-${suffix}@example.test`,
    password: "not-used-in-test", role: "OWNER",
  } })
  const supplier = await db.supplier.create({ data: { companyId: company.id, name: `Supplier ${suffix}` } })

  mock.module("@/lib/session", {
    namedExports: { getActiveSession: async () => ({ user: { id: owner.id, companyId: company.id, role: "OWNER" } }) },
  })
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
  setAuthorizationSessionResolverForTests(async () => ({
    user: { id: owner.id, companyId: company.id, role: "OWNER" },
  }))
  const { recordSupplierPayment, updateSupplierPayment } = await import("./actions")

  t.after(() => setAuthorizationSessionResolverForTests())
  t.after(async () => {
    await db.journalLine.deleteMany({ where: { journalEntry: { companyId: company.id } } })
    await db.journalEntry.deleteMany({ where: { companyId: company.id } })
    await db.supplierPayment.deleteMany({ where: { companyId: company.id } })
    await db.account.deleteMany({ where: { companyId: company.id } })
    await db.supplier.deleteMany({ where: { companyId: company.id } })
    await db.auditLog.deleteMany({ where: { companyId: company.id } })
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

  // 1) Record a supplier payment of 1000 cash.
  const createForm = new FormData()
  createForm.set("supplierId", supplier.id)
  createForm.set("amount", "1000")
  createForm.set("paymentMode", "CASH")
  createForm.set("paymentDate", "2027-01-01")
  await expectRedirect(() => recordSupplierPayment(null, createForm))

  const payment = await db.supplierPayment.findFirstOrThrow({ where: { companyId: company.id } })
  const originalEntry = await db.journalEntry.findFirstOrThrow({
    where: { companyId: company.id, sourceType: "SUPPLIER_PAYMENT", sourceId: payment.id },
  })
  assert.equal(originalEntry.status, "POSTED")
  assert.equal(originalEntry.totalAmount.toString(), "1000")

  // 2) Edit the payment amount to 1500 — this must reverse the stale 1000
  // entry and post a corrected one, not just mutate the payment row.
  const editForm = new FormData()
  editForm.set("paymentId", payment.id)
  editForm.set("amount", "1500")
  editForm.set("paymentMode", "CASH")
  editForm.set("paymentDate", "2027-01-01")
  await expectRedirect(() => updateSupplierPayment(null, editForm))

  const reloadedPayment = await db.supplierPayment.findUniqueOrThrow({ where: { id: payment.id } })
  assert.equal(reloadedPayment.amount.toString(), "1500")

  const staleEntry = await db.journalEntry.findUniqueOrThrow({ where: { id: originalEntry.id } })
  assert.equal(staleEntry.status, "REVERSED", "the original 1000 entry must be reversed, not left dangling")

  const activeType = await currentActiveSourceType(db, company.id, "SUPPLIER_PAYMENT", payment.id)
  assert.ok(activeCorrectionPattern.test(activeType), `expected a correction sourceType, got ${activeType}`)
  const correctedEntry = await db.journalEntry.findFirstOrThrow({
    where: { companyId: company.id, sourceId: payment.id, sourceType: activeType, status: "POSTED" },
  })
  assert.equal(correctedEntry.totalAmount.toString(), "1500", "the ledger must reflect the corrected amount, not the stale 1000")

  // Editing only cosmetic fields (reference/notes) must NOT trigger a
  // needless reverse+repost cycle.
  const cosmeticEditForm = new FormData()
  cosmeticEditForm.set("paymentId", payment.id)
  cosmeticEditForm.set("amount", "1500")
  cosmeticEditForm.set("paymentMode", "CASH")
  cosmeticEditForm.set("paymentDate", "2027-01-01")
  cosmeticEditForm.set("notes", "just a note, no financial change")
  await expectRedirect(() => updateSupplierPayment(null, cosmeticEditForm))

  const entriesAfterCosmeticEdit = await db.journalEntry.findMany({ where: { companyId: company.id, sourceId: payment.id } })
  assert.equal(entriesAfterCosmeticEdit.length, 3, "a cosmetic-only edit must not create new journal entries (original + reversal + one correction)")
})

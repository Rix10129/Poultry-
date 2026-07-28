import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { db } from "@/lib/db"
import { setAuthorizationSessionResolverForTests } from "@/lib/authorization"
import { currentActiveSourceType } from "@/lib/accounting/posting-service"

// Excludes _REVERSAL siblings, which are deliberately left POSTED but aren't
// the document's current state (see currentActiveSourceType in posting-service.ts).
const activeCorrectionPattern = /^SALE_INVOICE(_CORRECTION_\d+)?$/

const runDatabaseTests = process.env.RUN_DATABASE_CONCURRENCY_TESTS === "1"

test("editing a posted invoice reverses the stale ledger entry and reposts the corrected one", {
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
  const { createInvoice, updateInvoice, reverseInvoice } = await import("./actions")

  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `Invoice edit test ${suffix}` } })
  const user = await db.user.create({ data: {
    companyId: company.id, name: "Invoice edit test user", email: `invedit-${suffix}@example.test`,
    password: "not-used-in-test", role: "OWNER",
  } })
  const product = await db.product.create({ data: {
    companyId: company.id, name: `Invoice edit product ${suffix}`, salePrice: 100, purchasePrice: 80,
  } })
  const batch = await db.productBatch.create({ data: {
    companyId: company.id, productId: product.id, batchNumber: `BATCH-${suffix}`,
    expiryDate: new Date("2027-01-01"), purchasePrice: 80, salePrice: 100, quantity: 50, initialQuantity: 50,
  } })

  setAuthorizationSessionResolverForTests(async () => ({
    user: { id: user.id, companyId: company.id, role: "OWNER" },
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

  // 1) Create a cash-sale invoice for 5 units @ 100 = 500.
  const createForm = new FormData()
  createForm.set("paymentMode", "CASH")
  createForm.set("paidAmount", "500")
  createForm.set("linesJson", JSON.stringify([
    { productId: product.id, batchId: batch.id, quantity: 5, salePrice: 100, discount: 0, taxRate: 0 },
  ]))
  await expectRedirect(() => createInvoice(null, createForm))

  const invoice = await db.saleInvoice.findFirstOrThrow({ where: { companyId: company.id } })
  assert.equal(invoice.netAmount.toString(), "500")

  const originalEntry = await db.journalEntry.findFirstOrThrow({
    where: { companyId: company.id, sourceType: "SALE_INVOICE", sourceId: invoice.id },
  })
  assert.equal(originalEntry.status, "POSTED")
  assert.equal(originalEntry.totalAmount.toString(), "500")

  // 2) Edit the invoice: bump quantity to 8 units @ 100 = 800.
  const editForm = new FormData()
  editForm.set("id", invoice.id)
  editForm.set("paymentMode", "CASH")
  editForm.set("linesJson", JSON.stringify([
    { productId: product.id, batchId: batch.id, quantity: 8, salePrice: 100, discount: 0, taxRate: 0 },
  ]))
  await expectRedirect(() => updateInvoice(null, editForm))

  const reloadedInvoice = await db.saleInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
  assert.equal(reloadedInvoice.netAmount.toString(), "800", "invoice row reflects the new total")

  const staleEntry = await db.journalEntry.findUniqueOrThrow({ where: { id: originalEntry.id } })
  assert.equal(staleEntry.status, "REVERSED", "the original 500 entry must be reversed, not left dangling")

  const allPostedAfterEdit1 = await db.journalEntry.findMany({
    where: { companyId: company.id, sourceId: invoice.id, sourceType: { startsWith: "SALE_INVOICE" }, status: "POSTED" },
  })
  const correctionEntries = allPostedAfterEdit1.filter(e => activeCorrectionPattern.test(e.sourceType ?? ""))
  assert.equal(correctionEntries.length, 1, "exactly one corrected entry should be active")
  assert.equal(correctionEntries[0].totalAmount.toString(), "800", "the ledger must reflect the corrected total, not the stale 500")

  // Net effect across all of this invoice's journal lines must equal the
  // CURRENT invoice total (500 posted, then reversed -500, then +800 = 800),
  // not some drifted figure.
  const allEntries = await db.journalEntry.findMany({
    where: { companyId: company.id, sourceId: invoice.id },
    include: { lines: true },
  })
  let salesNet = 0
  for (const entry of allEntries) {
    for (const line of entry.lines) {
      // SALES is a credit-normal revenue account: credits increase it, debits reduce it.
      const account = await db.account.findUnique({ where: { id: line.creditAccountId ?? line.debitAccountId ?? "" } })
      if (account?.code !== "4000") continue // SALES account code
      if (line.creditAccountId) salesNet += Number(line.amount)
      if (line.debitAccountId) salesNet -= Number(line.amount)
    }
  }
  assert.equal(salesNet, 800, "net SALES postings for this invoice must equal the current total, not the original")

  // 3) Edit again to prove multi-generation correction works (finds the
  // CURRENT active entry, whichever generation it's on, not just the original).
  const editForm2 = new FormData()
  editForm2.set("id", invoice.id)
  editForm2.set("paymentMode", "CASH")
  editForm2.set("linesJson", JSON.stringify([
    { productId: product.id, batchId: batch.id, quantity: 3, salePrice: 100, discount: 0, taxRate: 0 },
  ]))
  await expectRedirect(() => updateInvoice(null, editForm2))

  const activeTypeAfterEdit2 = await currentActiveSourceType(db, company.id, "SALE_INVOICE", invoice.id)
  const secondCorrection = await db.journalEntry.findFirstOrThrow({
    where: { companyId: company.id, sourceId: invoice.id, sourceType: activeTypeAfterEdit2, status: "POSTED" },
  })
  assert.equal(secondCorrection.totalAmount.toString(), "300")
  assert.equal(correctionEntries[0].id === secondCorrection.id, false, "must be a fresh entry, not the same one mutated")

  const firstCorrectionReloaded = await db.journalEntry.findUniqueOrThrow({ where: { id: correctionEntries[0].id } })
  assert.equal(firstCorrectionReloaded.status, "REVERSED", "the first correction must itself be reversed once superseded")

  // 4) Full cancellation afterwards must find and reverse the CURRENT
  // generation (the second correction), not the long-since-reversed original.
  const cancelForm = new FormData()
  cancelForm.set("id", invoice.id)
  cancelForm.set("reason", "test cancellation")
  await expectRedirect(() => reverseInvoice(null, cancelForm))

  const finalInvoice = await db.saleInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
  assert.equal(finalInvoice.status, "REVERSED")

  const secondCorrectionReloaded = await db.journalEntry.findUniqueOrThrow({ where: { id: secondCorrection.id } })
  assert.equal(secondCorrectionReloaded.status, "REVERSED", "cancelling the invoice must reverse whichever generation was active")
})

test("editing an invoice untouched on a since-expired batch succeeds, but increasing its quantity is still blocked", {
  skip: runDatabaseTests ? false : "set RUN_DATABASE_CONCURRENCY_TESTS=1 against a migrated test database",
}, async (t) => {
  const { createInvoice, updateInvoice } = await import("./actions")

  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `Expired batch edit test ${suffix}` } })
  const user = await db.user.create({ data: {
    companyId: company.id, name: "Expired batch edit test user", email: `expedit-${suffix}@example.test`,
    password: "not-used-in-test", role: "OWNER",
  } })
  const product = await db.product.create({ data: {
    companyId: company.id, name: `Expired batch edit product ${suffix}`, salePrice: 100, purchasePrice: 80,
  } })
  const batch = await db.productBatch.create({ data: {
    companyId: company.id, productId: product.id, batchNumber: `BATCH-${suffix}`,
    expiryDate: new Date("2027-01-01"), purchasePrice: 80, salePrice: 100, quantity: 50, initialQuantity: 50,
  } })

  setAuthorizationSessionResolverForTests(async () => ({
    user: { id: user.id, companyId: company.id, role: "OWNER" },
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

  const createForm = new FormData()
  createForm.set("paymentMode", "CASH")
  createForm.set("paidAmount", "500")
  createForm.set("linesJson", JSON.stringify([
    { productId: product.id, batchId: batch.id, quantity: 5, salePrice: 100, discount: 0, taxRate: 0 },
  ]))
  await expectRedirect(() => createInvoice(null, createForm))

  const invoice = await db.saleInvoice.findFirstOrThrow({ where: { companyId: company.id } })

  // Simulate the batch expiring after the sale — a completely normal thing
  // to happen for a real historical invoice.
  await db.productBatch.update({ where: { id: batch.id }, data: { expiryDate: new Date("2020-01-01") } })

  // Editing something else on the invoice (bumping discount, say) while
  // leaving this line's quantity untouched must NOT fail just because the
  // batch it already used has since expired.
  const untouchedEditForm = new FormData()
  untouchedEditForm.set("id", invoice.id)
  untouchedEditForm.set("paymentMode", "CASH")
  untouchedEditForm.set("discountAmount", "10")
  untouchedEditForm.set("linesJson", JSON.stringify([
    { productId: product.id, batchId: batch.id, quantity: 5, salePrice: 100, discount: 0, taxRate: 0 },
  ]))
  await expectRedirect(() => updateInvoice(null, untouchedEditForm))

  const afterUntouchedEdit = await db.saleInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
  assert.equal(afterUntouchedEdit.discountAmount.toString(), "10", "the unrelated edit must have gone through")

  // But trying to sell MORE from that same now-expired batch must still be blocked.
  const increaseEditForm = new FormData()
  increaseEditForm.set("id", invoice.id)
  increaseEditForm.set("paymentMode", "CASH")
  increaseEditForm.set("linesJson", JSON.stringify([
    { productId: product.id, batchId: batch.id, quantity: 8, salePrice: 100, discount: 0, taxRate: 0 },
  ]))
  const result = await updateInvoice(null, increaseEditForm)
  assert.ok(result?.error, "expected increasing quantity on an expired batch to be rejected")
  assert.match(result!.error, /expired batch/)
})

test("editing an invoice that has no accounting entry at all (legacy pre-posting data) posts one instead of failing", {
  skip: runDatabaseTests ? false : "set RUN_DATABASE_CONCURRENCY_TESTS=1 against a migrated test database",
}, async (t) => {
  const { createInvoice, updateInvoice } = await import("./actions")

  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `Legacy invoice edit test ${suffix}` } })
  const user = await db.user.create({ data: {
    companyId: company.id, name: "Legacy invoice edit test user", email: `legacyedit-${suffix}@example.test`,
    password: "not-used-in-test", role: "OWNER",
  } })
  const product = await db.product.create({ data: {
    companyId: company.id, name: `Legacy invoice edit product ${suffix}`, salePrice: 100, purchasePrice: 80,
  } })
  const batch = await db.productBatch.create({ data: {
    companyId: company.id, productId: product.id, batchNumber: `BATCH-${suffix}`,
    expiryDate: new Date("2027-01-01"), purchasePrice: 80, salePrice: 100, quantity: 50, initialQuantity: 50,
  } })

  setAuthorizationSessionResolverForTests(async () => ({
    user: { id: user.id, companyId: company.id, role: "OWNER" },
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

  const createForm = new FormData()
  createForm.set("paymentMode", "CASH")
  createForm.set("paidAmount", "500")
  createForm.set("linesJson", JSON.stringify([
    { productId: product.id, batchId: batch.id, quantity: 5, salePrice: 100, discount: 0, taxRate: 0 },
  ]))
  await expectRedirect(() => createInvoice(null, createForm))

  const invoice = await db.saleInvoice.findFirstOrThrow({ where: { companyId: company.id } })

  // Simulate legacy production data: a real invoice that predates proper
  // ledger posting, so it has NO JournalEntry at all — exactly what the
  // client's production database looked like for older invoices created
  // during the schema-drift outage.
  await db.journalLine.deleteMany({ where: { journalEntry: { companyId: company.id } } })
  await db.journalEntry.deleteMany({ where: { companyId: company.id } })

  const editForm = new FormData()
  editForm.set("id", invoice.id)
  editForm.set("paymentMode", "CASH")
  editForm.set("linesJson", JSON.stringify([
    { productId: product.id, batchId: batch.id, quantity: 8, salePrice: 100, discount: 0, taxRate: 0 },
  ]))
  await expectRedirect(() => updateInvoice(null, editForm))

  const reloadedInvoice = await db.saleInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
  assert.equal(reloadedInvoice.netAmount.toString(), "800", "the edit must have gone through despite no prior ledger entry")

  const freshEntry = await db.journalEntry.findFirstOrThrow({
    where: { companyId: company.id, sourceId: invoice.id, sourceType: "SALE_INVOICE", status: "POSTED" },
  })
  assert.equal(freshEntry.totalAmount.toString(), "800", "a fresh entry must be posted at the current (edited) total")
})

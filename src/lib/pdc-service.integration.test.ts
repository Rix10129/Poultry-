import assert from "node:assert/strict"
import test from "node:test"

import { db } from "@/lib/db"
import { createPDCCheque, depositPDCCheque, bouncePDCCheque } from "./pdc-service"

const runDatabaseTests = process.env.RUN_DATABASE_CONCURRENCY_TESTS === "1"

async function journalLineFor(companyId: string, sourceType: string, sourceId: string) {
  return db.journalEntry.findFirst({
    where: { companyId, sourceType, sourceId },
    include: { lines: { include: { debitAccount: true, creditAccount: true } } },
  })
}

test("PDC cheques post real accounting entries through their full lifecycle", {
  skip: runDatabaseTests ? false : "set RUN_DATABASE_CONCURRENCY_TESTS=1 against a migrated test database",
}, async (t) => {
  const suffix = crypto.randomUUID()
  const company = await db.company.create({ data: { name: `PDC test ${suffix}` } })
  const owner = await db.user.create({ data: {
    companyId: company.id, name: "PDC owner", email: `pdc-owner-${suffix}@example.test`,
    password: "not-used-in-test", role: "OWNER",
  } })
  const customer = await db.customer.create({ data: { companyId: company.id, name: `PDC customer ${suffix}` } })
  const supplier = await db.supplier.create({ data: { companyId: company.id, name: `PDC supplier ${suffix}` } })

  t.after(async () => {
    await db.journalLine.deleteMany({ where: { journalEntry: { companyId: company.id } } })
    await db.journalEntry.deleteMany({ where: { companyId: company.id } })
    await db.pDCCheque.deleteMany({ where: { companyId: company.id } })
    await db.customerPayment.deleteMany({ where: { companyId: company.id } })
    await db.supplierPayment.deleteMany({ where: { companyId: company.id } })
    await db.account.deleteMany({ where: { companyId: company.id } })
    await db.customer.deleteMany({ where: { companyId: company.id } })
    await db.supplier.deleteMany({ where: { companyId: company.id } })
    await db.auditLog.deleteMany({ where: { companyId: company.id } })
    await db.user.deleteMany({ where: { companyId: company.id } })
    await db.company.delete({ where: { id: company.id } })
  })

  await t.test("receivable: create books to the clearing account, deposit moves it to Bank", async () => {
    const { id: chequeId } = await createPDCCheque(company.id, {
      type: "RECEIVABLE", customerId: customer.id, chequeNumber: `CHQ-${suffix}`,
      chequeDate: new Date("2027-01-01"), amount: 500,
    })

    const cheque = await db.pDCCheque.findUniqueOrThrow({ where: { id: chequeId } })
    assert.equal(cheque.status, "PENDING")
    assert.ok(cheque.customerPaymentId, "expected a linked CustomerPayment")

    const payment = await db.customerPayment.findUniqueOrThrow({ where: { id: cheque.customerPaymentId! } })
    assert.equal(payment.status, "POSTED")
    assert.equal(payment.paymentMode, "CHEQUE")
    assert.equal(payment.amount.toString(), "500")

    const receiptEntry = await journalLineFor(company.id, "CUSTOMER_RECEIPT", payment.id)
    assert.ok(receiptEntry, "expected a CUSTOMER_RECEIPT journal entry")
    const debit = receiptEntry!.lines.find(l => l.debitAccountId)!
    const credit = receiptEntry!.lines.find(l => l.creditAccountId)!
    assert.equal(debit.debitAccount!.code, "1020") // Cheques in Hand, not Bank
    assert.equal(credit.creditAccount!.code, "1100") // Accounts Receivable

    await depositPDCCheque(company.id, chequeId)

    const depositedCheque = await db.pDCCheque.findUniqueOrThrow({ where: { id: chequeId } })
    assert.equal(depositedCheque.status, "DEPOSITED")
    assert.ok(depositedCheque.depositedAt)

    const depositEntry = await journalLineFor(company.id, "PDC_DEPOSIT", chequeId)
    assert.ok(depositEntry, "expected a PDC_DEPOSIT journal entry")
    const depositDebit = depositEntry!.lines.find(l => l.debitAccountId)!
    const depositCredit = depositEntry!.lines.find(l => l.creditAccountId)!
    assert.equal(depositDebit.debitAccount!.code, "1010") // Bank
    assert.equal(depositCredit.creditAccount!.code, "1020") // Cheques in Hand

    // Depositing twice must not be allowed.
    await assert.rejects(() => depositPDCCheque(company.id, chequeId), /pending cheque/)
  })

  await t.test("receivable: bouncing after deposit reverses both the deposit and the original receipt", async () => {
    const { id: chequeId } = await createPDCCheque(company.id, {
      type: "RECEIVABLE", customerId: customer.id, chequeNumber: `CHQ-BOUNCE-${suffix}`,
      chequeDate: new Date("2027-01-01"), amount: 300,
    })
    await depositPDCCheque(company.id, chequeId)
    await bouncePDCCheque(company.id, chequeId, { id: owner.id, name: owner.name }, "Insufficient funds")

    const bouncedCheque = await db.pDCCheque.findUniqueOrThrow({ where: { id: chequeId } })
    assert.equal(bouncedCheque.status, "BOUNCED")
    assert.ok(bouncedCheque.bouncedAt)

    const payment = await db.customerPayment.findUniqueOrThrow({ where: { id: bouncedCheque.customerPaymentId! } })
    assert.equal(payment.status, "REVERSED")

    const depositEntry = await journalLineFor(company.id, "PDC_DEPOSIT", chequeId)
    assert.equal(depositEntry!.status, "REVERSED")
    const depositReversal = await db.journalEntry.findFirst({ where: { reversesEntryId: depositEntry!.id } })
    assert.ok(depositReversal, "expected the deposit to have a reversal entry")

    const receiptEntry = await journalLineFor(company.id, "CUSTOMER_RECEIPT", payment.id)
    assert.equal(receiptEntry!.status, "REVERSED")
    const receiptReversal = await db.journalEntry.findFirst({ where: { reversesEntryId: receiptEntry!.id } })
    assert.ok(receiptReversal, "expected the original receipt to have a reversal entry")

    // Bouncing an already-bounced cheque must not be allowed.
    await assert.rejects(
      () => bouncePDCCheque(company.id, chequeId, { id: owner.id, name: owner.name }, "second attempt"),
      /pending or deposited/
    )
  })

  await t.test("payable: create books to the outstanding-cheques liability clearing account", async () => {
    const { id: chequeId } = await createPDCCheque(company.id, {
      type: "PAYABLE", supplierId: supplier.id, chequeNumber: `CHQ-PAY-${suffix}`,
      chequeDate: new Date("2027-01-01"), amount: 200,
    })

    const cheque = await db.pDCCheque.findUniqueOrThrow({ where: { id: chequeId } })
    assert.ok(cheque.supplierPaymentId, "expected a linked SupplierPayment")

    const paymentEntry = await journalLineFor(company.id, "SUPPLIER_PAYMENT", cheque.supplierPaymentId!)
    assert.ok(paymentEntry, "expected a SUPPLIER_PAYMENT journal entry")
    const debit = paymentEntry!.lines.find(l => l.debitAccountId)!
    const credit = paymentEntry!.lines.find(l => l.creditAccountId)!
    assert.equal(debit.debitAccount!.code, "2000") // Accounts Payable
    assert.equal(credit.creditAccount!.code, "2050") // Cheques Issued (Outstanding), not Bank
  })

  await t.test("bounce requires a reversal reason of at least 3 characters", async () => {
    const { id: chequeId } = await createPDCCheque(company.id, {
      type: "RECEIVABLE", customerId: customer.id, chequeNumber: `CHQ-NOREASON-${suffix}`,
      chequeDate: new Date("2027-01-01"), amount: 50,
    })
    await assert.rejects(
      () => bouncePDCCheque(company.id, chequeId, { id: owner.id, name: owner.name }, "no"),
      /reversal reason/
    )
  })
})

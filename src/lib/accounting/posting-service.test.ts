import assert from "node:assert/strict"
import test from "node:test"
import { assertBalanced, swapJournalSides } from "./posting-service"

test("balanced postings pass and return their total", () => {
  const total = assertBalanced(
    [{ account: "CASH", amount: "25.10" }, { account: "ACCOUNTS_RECEIVABLE", amount: 74.9 }],
    [{ account: "SALES", amount: 90 }, { account: "OUTPUT_TAX", amount: 10 }],
  )
  assert.equal(total.toFixed(2), "100.00")
})

test("unbalanced postings are rejected", () => {
  assert.throws(
    () => assertBalanced([{ account: "CASH", amount: 10 }], [{ account: "SALES", amount: 9.99 }]),
    /Unbalanced journal entry/,
  )
})

test("a reversal swaps every debit and credit and remains balanced", () => {
  const original = [
    { debitAccountId: "cash", creditAccountId: null, amount: 40 },
    { debitAccountId: "receivable", creditAccountId: null, amount: 60 },
    { debitAccountId: null, creditAccountId: "sales", amount: 90 },
    { debitAccountId: null, creditAccountId: "tax", amount: 10 },
  ]
  const reversal = swapJournalSides(original)
  assert.deepEqual(reversal, [
    { debitAccountId: null, creditAccountId: "cash", amount: 40 },
    { debitAccountId: null, creditAccountId: "receivable", amount: 60 },
    { debitAccountId: "sales", creditAccountId: null, amount: 90 },
    { debitAccountId: "tax", creditAccountId: null, amount: 10 },
  ])
  const debit = reversal.filter(line => line.debitAccountId).reduce((sum, line) => sum + Number(line.amount), 0)
  const credit = reversal.filter(line => line.creditAccountId).reduce((sum, line) => sum + Number(line.amount), 0)
  assert.equal(debit, credit)
})

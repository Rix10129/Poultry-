import assert from "node:assert/strict"
import test from "node:test"
import { assertBalanced } from "./posting-service"

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

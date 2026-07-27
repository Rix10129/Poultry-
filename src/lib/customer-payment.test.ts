import assert from "node:assert/strict"
import test from "node:test"

import { validateInvoicePayment } from "./customer-payment"

const invoice = { id: "inv-1", companyId: "co-1", customerId: "cust-1", netAmount: "100.00", status: "POSTED" }

test("invoice allocation derives paid amount only from posted CustomerPayment rows", () => {
  const result = validateInvoicePayment({ invoice, companyId: "co-1", customerId: "cust-1", amount: 40,
    postedPayments: [{ amount: 25 }, { amount: "10.00" }] })
  assert.deepEqual(result, { paid: 35, remaining: 65, newPaidAmount: 75 })
})

test("rejects cross-customer and cross-company invoice allocations", () => {
  for (const selection of [{ companyId: "co-2", customerId: "cust-1" }, { companyId: "co-1", customerId: "cust-2" }]) {
    assert.throws(() => validateInvoicePayment({ invoice, ...selection, amount: 1, postedPayments: [] }),
      /selected customer and company/)
  }
})

test("rejects an invoice overpayment instead of creating an implicit credit", () => {
  assert.throws(() => validateInvoicePayment({ invoice, companyId: "co-1", customerId: "cust-1", amount: 61,
    postedPayments: [{ amount: 40 }] }), /remaining invoice balance of 60.00/)
})

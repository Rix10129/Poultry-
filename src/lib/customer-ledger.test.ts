import assert from "node:assert/strict"
import test from "node:test"

import { buildCustomerLedger } from "./customer-ledger"

const date = (value: string) => new Date(`${value}T12:00:00.000Z`)

const scenario = {
  customerOpeningBalance: "50.00",
  invoices: [
    {
      id: "cash-invoice",
      invoiceNumber: "INV-001",
      invoiceDate: date("2026-01-01"),
      netAmount: "100.00",
      paidAmount: "100.00",
    },
    {
      id: "partial-invoice",
      invoiceNumber: "INV-002",
      invoiceDate: date("2026-01-02"),
      netAmount: "200.00",
      paidAmount: "100.00",
    },
  ],
  payments: [
    {
      invoiceId: "partial-invoice",
      paymentDate: date("2026-01-05"),
      amount: "60.00",
      paymentMode: "CASH",
      invoice: { invoiceNumber: "INV-002" },
    },
    {
      invoiceId: null,
      paymentDate: date("2026-02-03"),
      amount: "30.00",
      paymentMode: "BANK_TRANSFER",
      reference: "DEP-1",
      invoice: null,
    },
  ],
  returns: [
    {
      returnNumber: "RET-001",
      returnDate: date("2026-02-04"),
      totalAmount: "25.00",
    },
  ],
}

test("normalizes invoice receipts and linked payments without double counting", () => {
  const ledger = buildCustomerLedger({
    ...scenario,
    fromDate: date("2026-01-01"),
    toDate: date("2026-02-28"),
  })

  assert.equal(ledger.openingBalance, 50)
  assert.deepEqual(ledger.totals, { debit: 300, credit: 255 })
  assert.equal(ledger.closingBalance, 95)
  assert.deepEqual(
    ledger.rows.map(({ description, credit }) => [description, credit]),
    [
      ["Invoice INV-001", 0],
      ["Receipt with Invoice INV-001", 100],
      ["Invoice INV-002", 0],
      ["Receipt with Invoice INV-002", 40],
      ["Payment (vs. INV-002) — CASH", 60],
      ["Payment — BANK_TRANSFER #DEP-1", 30],
      ["Return RET-001", 25],
    ]
  )
})

test("date-filtered statement carries all earlier invoices and credits into opening", () => {
  const ledger = buildCustomerLedger({
    ...scenario,
    fromDate: date("2026-02-01"),
    toDate: date("2026-02-28"),
  })

  assert.equal(ledger.openingBalance, 150)
  assert.deepEqual(ledger.totals, { debit: 0, credit: 55 })
  assert.equal(ledger.closingBalance, 95)
  assert.deepEqual(ledger.rows.map((row) => row.balance), [120, 95])
})

import assert from "node:assert/strict"
import test from "node:test"

import { buildCustomerLedger, calculateCustomerBalance, parseOpeningBalanceCorrections } from "./customer-ledger"

const date = (value: string) => new Date(`${value}T12:00:00.000Z`)

const scenario = {
  customerOpeningBalance: "50.00",
  invoices: [
    {
      id: "cash-invoice",
      invoiceNumber: "INV-001",
      invoiceDate: date("2026-01-01"),
      netAmount: "100.00",
    },
    {
      id: "partial-invoice",
      invoiceNumber: "INV-002",
      invoiceDate: date("2026-01-02"),
      netAmount: "200.00",
    },
  ],
  payments: [
    { invoiceId: "cash-invoice", paymentDate: date("2026-01-01"), amount: "100.00", paymentMode: "CASH", invoice: { invoiceNumber: "INV-001" } },
    { invoiceId: "partial-invoice", paymentDate: date("2026-01-02"), amount: "40.00", paymentMode: "CASH", invoice: { invoiceNumber: "INV-002" } },
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

test("reconciles opening balances, invoice receipts, direct credits, returns, and later payments exactly once", () => {
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
      ["Payment (vs. INV-001) — CASH", 100],
      ["Invoice INV-002", 0],
      ["Payment (vs. INV-002) — CASH", 40],
      ["Payment (vs. INV-002) — CASH", 60],
      ["Payment — BANK_TRANSFER #DEP-1", 30],
      ["Return RET-001", 25],
    ]
  )
})

test("all balance consumers reconcile to the shared closing balance", () => {
  const input = { openingBalance: scenario.customerOpeningBalance, invoices: scenario.invoices,
    payments: scenario.payments, returns: scenario.returns }
  const expected = buildCustomerLedger({ ...scenario, fromDate: date("2026-01-01"), toDate: date("2026-12-31") }).closingBalance
  const consumers = ["customer detail", "statement", "customer list", "recovery", "balance sheet", "Excel", "dashboard"]
  for (const consumer of consumers) assert.equal(calculateCustomerBalance(input).closingBalance, expected, consumer)
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

test("a payment's discount/write-off reduces the balance the same as cash, and appears in the narration", () => {
  const input = {
    customerOpeningBalance: "0",
    invoices: [{ id: "inv-1", invoiceNumber: "INV-500", invoiceDate: date("2026-03-01"), netAmount: "500.00" }],
    payments: [
      { invoiceId: "inv-1", paymentDate: date("2026-03-02"), amount: "100.00", discountAmount: "400.00", paymentMode: "CASH", invoice: { invoiceNumber: "INV-500" } },
    ],
    returns: [],
  }
  const ledger = buildCustomerLedger({ ...input, fromDate: date("2026-03-01"), toDate: date("2026-03-31") })
  assert.equal(ledger.closingBalance, 0, "the 100 cash + 400 discount together must fully settle the 500 invoice")
  assert.equal(ledger.rows[1].credit, 500, "credit must be the combined cash + discount, not cash alone")
  assert.match(ledger.rows[1].description, /Rs 100 received \+ Rs 400 discount/)

  const balance = calculateCustomerBalance({ openingBalance: input.customerOpeningBalance, invoices: input.invoices, payments: input.payments, returns: input.returns })
  assert.equal(balance.paid, 500, "calculateCustomerBalance must also count the discount as paid down")
})

test("opening-balance audit corrections are declared and counted once", () => {
  const corrections = parseOpeningBalanceCorrections([{ createdAt: date("2026-01-03"),
    detail: JSON.stringify({ oldValues: { openingBalance: "50" }, newValues: { openingBalance: 80 } }) }])
  const ledger = buildCustomerLedger({ ...scenario, corrections,
    fromDate: date("2026-01-01"), toDate: date("2026-12-31") })
  assert.equal(ledger.rows.find(row => row.description === "Opening balance correction")?.debit, 30)
  assert.equal(ledger.closingBalance, 125)
})

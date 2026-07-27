import assert from "node:assert/strict"
import test from "node:test"

import { buildCustomerLedger, calculateCustomerBalance } from "./customer-ledger"

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

test("counts invoice-time and later payment events exactly once", () => {
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

test("PKR 10,000 opening plus invoice less payment and return is PKR 11,000", () => {
  const balance = calculateCustomerBalance({
    openingBalance: "10000",
    invoices: [{ netAmount: "5000", invoiceDate: date("2026-01-02") }],
    payments: [{ amount: "3000", paymentDate: date("2026-01-03") }],
    returns: [{ totalAmount: "1000", returnDate: date("2026-01-04") }],
  })
  assert.equal(balance.closingBalance, 11000)
})

test("opening corrections take effect on their audit date", () => {
  const corrections = [{ createdAt: date("2026-02-01"), oldBalance: "8000", newBalance: "10000" }]
  const input = { openingBalance: "10000", corrections, invoices: [], payments: [], returns: [] }
  assert.equal(calculateCustomerBalance({ ...input, asOf: date("2026-01-31") }).closingBalance, 8000)
  assert.equal(calculateCustomerBalance({ ...input, asOf: date("2026-02-01") }).closingBalance, 10000)

  const ledger = buildCustomerLedger({
    customerOpeningBalance: "10000", customerCreatedAt: date("2026-01-01"), corrections,
    fromDate: date("2026-02-01"), toDate: date("2026-02-28"), invoices: [], payments: [], returns: [],
  })
  assert.equal(ledger.openingBalance, 8000)
  assert.equal(ledger.rows[0].description, "Opening Balance Correction")
  assert.equal(ledger.closingBalance, 10000)
})

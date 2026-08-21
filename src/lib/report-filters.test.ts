import assert from "node:assert/strict"
import test from "node:test"
import { matchesPaymentStatus, parseTransactionFilters, reportTotals } from "./report-filters"

test("screen and export totals stay equal when the same validated filters are applied", () => {
  const parsed = parseTransactionFilters(new URLSearchParams("from=2026-01-01&to=2026-01-31&paymentStatus=PARTIAL&minAmount=100"))
  assert.equal(parsed.success, true)
  const databaseRows = [{ netAmount: 500, paidAmount: 200, status: "POSTED" }, { netAmount: 300, paidAmount: 300, status: "POSTED" }, { netAmount: 90, paidAmount: 20, status: "POSTED" }]
  const screenRows = databaseRows.filter(row => Number(row.netAmount) >= 100).filter(row => matchesPaymentStatus(row, "PARTIAL"))
  const exportRows = databaseRows.filter(row => Number(row.netAmount) >= 100).filter(row => matchesPaymentStatus(row, parsed.success ? parsed.data.paymentStatus : ""))
  assert.deepEqual(reportTotals(exportRows), reportTotals(screenRows))
  assert.deepEqual(reportTotals(exportRows), { net: 500, paid: 200 })
})

test("reportTotals excludes reversed and cancelled documents from the sums", () => {
  const rows = [
    { netAmount: 500, paidAmount: 500, status: "POSTED" },
    { netAmount: 1000, paidAmount: 0, status: "REVERSED" },
    { netAmount: 250, paidAmount: 0, status: "CANCELLED" },
    { netAmount: 100, paidAmount: 0, status: "DRAFT" },
  ]
  assert.deepEqual(reportTotals(rows), { net: 500, paid: 500 })
})

test("invalid date and amount ranges cannot reach an export query", () => {
  assert.equal(parseTransactionFilters(new URLSearchParams("from=2026-02-01&to=2026-01-01")).success, false)
  assert.equal(parseTransactionFilters(new URLSearchParams("minAmount=500&maxAmount=100")).success, false)
})

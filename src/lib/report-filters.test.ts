import assert from "node:assert/strict"
import test from "node:test"
import { matchesPaymentStatus, parseTransactionFilters, reportTotals } from "./report-filters"

test("screen and export totals stay equal when the same validated filters are applied", () => {
  const parsed = parseTransactionFilters(new URLSearchParams("from=2026-01-01&to=2026-01-31&paymentStatus=PARTIAL&minAmount=100"))
  assert.equal(parsed.success, true)
  const databaseRows = [{ netAmount: 500, paidAmount: 200 }, { netAmount: 300, paidAmount: 300 }, { netAmount: 90, paidAmount: 20 }]
  const screenRows = databaseRows.filter(row => Number(row.netAmount) >= 100).filter(row => matchesPaymentStatus(row, "PARTIAL"))
  const exportRows = databaseRows.filter(row => Number(row.netAmount) >= 100).filter(row => matchesPaymentStatus(row, parsed.success ? parsed.data.paymentStatus : ""))
  assert.deepEqual(reportTotals(exportRows), reportTotals(screenRows))
  assert.deepEqual(reportTotals(exportRows), { net: 500, paid: 200 })
})

test("invalid date and amount ranges cannot reach an export query", () => {
  assert.equal(parseTransactionFilters(new URLSearchParams("from=2026-02-01&to=2026-01-01")).success, false)
  assert.equal(parseTransactionFilters(new URLSearchParams("minAmount=500&maxAmount=100")).success, false)
})

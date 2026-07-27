import assert from "node:assert/strict"
import test from "node:test"

import { lineBase, calculateDocumentTotals } from "./invoice-math"

test("lineBase applies a percentage discount to quantity * unitPrice", () => {
  assert.equal(lineBase(10, 100, 0), 1000)
  assert.equal(lineBase(10, 100, 10), 900)
  assert.equal(lineBase(2, 50, 50), 50)
})

test("lineBase treats a bonus/free line as zero revenue regardless of price or discount", () => {
  assert.equal(lineBase(5, 200, 0, true), 0)
  assert.equal(lineBase(5, 200, 50, true), 0)
})

test("calculateDocumentTotals sums line bases, applies tax per line, and nets off a document discount", () => {
  const lines = [
    { quantity: 10, discount: 0, taxRate: 17 },
    { quantity: 5, discount: 10, taxRate: 0 },
  ]
  const totals = calculateDocumentTotals(lines, () => 100, 50)
  // line 1: base 1000, tax 170
  // line 2: base 450, tax 0
  assert.equal(totals.totalAmount, 1450)
  assert.equal(totals.taxAmount, 170)
  assert.equal(totals.netAmount, 1450 - 50 + 170)
})

test("calculateDocumentTotals excludes bonus lines from totals but still evaluates real lines normally", () => {
  const lines = [
    { quantity: 10, discount: 0, taxRate: 17 },
    { quantity: 1, discount: 0, taxRate: 17, isBonus: true },
  ]
  const totals = calculateDocumentTotals(lines, () => 100, 0)
  assert.equal(totals.totalAmount, 1000)
  assert.equal(totals.taxAmount, 170)
  assert.equal(totals.netAmount, 1170)
})

test("calculateDocumentTotals never returns a negative net amount", () => {
  const lines = [{ quantity: 1, discount: 0, taxRate: 0 }]
  const totals = calculateDocumentTotals(lines, () => 10, 1000)
  assert.equal(totals.netAmount, 0)
})

import assert from "node:assert/strict"
import test from "node:test"

import { formatCurrency } from "./utils"

// Matches the space Intl.NumberFormat itself used between "Rs" and the
// number before this formatter was hand-rolled — kept for visual consistency.
const NBSP = " "
const rs = (grouped: string) => `Rs${NBSP}${grouped}`

test("formatCurrency groups PKR amounts using the lakh/crore convention", () => {
  assert.equal(formatCurrency(500), rs("500.00"))
  assert.equal(formatCurrency(1234), rs("1,234.00"))
  assert.equal(formatCurrency(123456), rs("1,23,456.00"))
  assert.equal(formatCurrency(1234567.89), rs("12,34,567.89"))
  assert.equal(formatCurrency(12345678), rs("1,23,45,678.00"))
})

test("formatCurrency handles negative PKR amounts and zero/nullish input", () => {
  assert.equal(formatCurrency(-1234567), `-${rs("12,34,567.00")}`)
  assert.equal(formatCurrency(0), rs("0.00"))
  assert.equal(formatCurrency(null), rs("0.00"))
  assert.equal(formatCurrency(undefined), rs("0.00"))
})

test("formatCurrency accepts string amounts", () => {
  assert.equal(formatCurrency("1234567.5"), rs("12,34,567.50"))
})

test("formatCurrency leaves non-PKR currencies on standard Western grouping", () => {
  assert.equal(formatCurrency(1234567.89, "USD"), "US$1,234,567.89")
})

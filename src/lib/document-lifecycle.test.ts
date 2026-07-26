import assert from "node:assert/strict"
import test from "node:test"
import { assertDocumentCanBeDeleted } from "./document-lifecycle"

test("an untouched draft can be permanently deleted", () => {
  assert.doesNotThrow(() => assertDocumentCanBeDeleted("DRAFT"))
})

for (const status of ["POSTED", "CANCELLED", "REVERSED"] as const) {
  test(`${status.toLowerCase()} documents cannot be permanently deleted`, () => {
    assert.throws(() => assertDocumentCanBeDeleted(status), /cannot be deleted/)
  })
}

test("draft documents with operational records cannot be permanently deleted", () => {
  for (const dependency of ["stockMovements", "payments", "ledgerPostings", "returns", "journalEntries"] as const) {
    assert.throws(() => assertDocumentCanBeDeleted("DRAFT", { [dependency]: 1 }), /Reverse the document instead/)
  }
})

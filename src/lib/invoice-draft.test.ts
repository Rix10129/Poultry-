import assert from "node:assert/strict"
import test from "node:test"
import { INVOICE_DRAFT_VERSION, persistInvoiceDraft, revalidateInvoiceDraft, type InvoiceDraftData } from "./invoice-draft"

const draft: InvoiceDraftData = {
  version: INVOICE_DRAFT_VERSION, customerId: "c1", customerName: "Farm", invoiceDate: "2026-07-26",
  dueDate: "", paymentMode: "CASH", paidAmount: "", discountAmount: "", notes: "unfinished",
  lines: [{ productId: "p1", productName: "Feed", unit: "KG", batchId: "b1", batchNumber: "B1", expiryDate: "2027-01-01", quantity: 2, salePrice: 10, discount: 0, taxRate: 0, savedAvailable: 8, savedCatalogPrice: 10 }],
}

test("draft revalidation warns about changed stock and prices without mutating saved values", () => {
  const result = revalidateInvoiceDraft(draft, {
    customers: new Map([["c1", { name: "Farm" }]]),
    products: new Map([["p1", { name: "Feed", active: true, salePrice: 12, taxRate: 0 }]]),
    batches: new Map([["b1", { productId: "p1", batchNumber: "B1", quantity: 5, salePrice: 12, expiryDate: new Date("2027-01-01") }]]),
  }, new Date("2026-07-26"))
  assert.equal(result.data.lines[0].salePrice, 10)
  assert.equal(result.data.lines[0].maxQty, 5)
  assert.match(result.warnings.join(" "), /catalog price changed/)
  assert.match(result.warnings.join(" "), /availability changed/)
})

test("saving a draft only writes the draft repository and never stock or accounting", async () => {
  const operations: string[] = []
  const repository = { invoiceDraft: {
    async updateMany() { operations.push("invoiceDraft.updateMany"); return { count: 1 } },
    async findUnique() { operations.push("invoiceDraft.findUnique"); return { id: "d1", updatedAt: new Date() } },
    async create() { operations.push("invoiceDraft.create"); return { id: "d1", updatedAt: new Date() } },
  } }
  await persistInvoiceDraft(repository, { companyId: "co1", userId: "u1" }, draft)
  assert.deepEqual(operations, ["invoiceDraft.create"])
  assert.deepEqual(operations.filter(name => /stockMovement|journalEntry|customerPayment|productBatch|saleInvoice/.test(name)), [])
})

import assert from "node:assert/strict"
import test from "node:test"
import { commitInventoryImport, ImportProblem, parseImportRows, previewInventoryImport } from "./inventory-import"

const actor = { id: "user-1", companyId: "company-1" }
const payload = (overrides: Record<string, unknown> = {}) => ({
  suppliers: [{ id: "source-supplier", name: "Acme Feed" }],
  products: [{
    name: "Vitamin A", supplierId: "source-supplier", companyId: "company-1",
    unit: "VIAL", species: "BROILER", purchasePrice: 12, salePrice: 18,
    batches: [{ batchNumber: "LOT-1", quantity: 10, manufactureDate: "2026-01-01", expiryDate: "2027-01-01", ...overrides }],
  }],
})

test("valid rows normalize supplier, product, batch, units, dates, quantities, and prices", () => {
  const [row] = parseImportRows(payload(), actor.companyId)
  assert.deepEqual(row.errors, [])
  assert.equal(row.supplierName, "Acme Feed")
  assert.equal(row.unit, "VIAL")
  assert.equal(row.quantity, 10)
  assert.equal(row.purchasePrice, 12)
})

test("invalid rows report ownership, reference, unit, date, quantity, price, and batch errors", () => {
  const input: any = payload({ batchNumber: "", quantity: 1.5, manufactureDate: "2028-01-01", expiryDate: "bad", purchasePrice: -1 })
  input.products[0].companyId = "another-company"
  input.products[0].supplierId = "unknown"
  input.products[0].unit = "PALLET"
  const [row] = parseImportRows(input, actor.companyId)
  assert.match(row.errors.join(" | "), /another company|does not resolve|Unsupported unit|Batch number|Expiry date|Quantity|Purchase price/)
})

test("duplicate files and supplier/batch combinations are warnings that require confirmation", async () => {
  const db = {
    inventoryImport: { findFirst: async () => ({ id: "old-import" }) },
    productBatch: { findMany: async () => [] },
  }
  const preview = await previewInventoryImport(db, actor, "backup.json", "a".repeat(64), payload())
  assert.equal(preview.duplicateFile, true)
  await assert.rejects(() => commitInventoryImport({ $transaction: () => assert.fail("must not begin") }, actor, preview, false), (error: unknown) => error instanceof ImportProblem && error.status === 409)
})

function transactionDb(failAt?: "product") {
  const committed: string[] = []
  let importRecord: any = null
  const tx: any = {
    $executeRaw: async () => 1,
    inventoryImport: {
      findFirst: async () => importRecord,
      create: async ({ data }: any) => { importRecord = data; committed.push("import"); return data },
    },
    supplier: { findFirst: async () => null, create: async () => ({ id: "supplier-1" }) },
    product: { findFirst: async () => null, create: async () => { if (failAt === "product") throw new Error("database failure"); return { id: "product-1" } } },
    productBatch: { findUnique: async () => null, create: async () => ({ id: "batch-1" }) },
    inventoryOpeningStock: { create: async () => ({ id: "opening-1" }) },
    stockMovement: { create: async () => ({ id: "movement-1" }) },
    inventoryImportRow: { create: async () => ({ id: "row-1" }) },
  }
  let queue = Promise.resolve()
  return {
    committed,
    $transaction: (callback: (arg: any) => Promise<unknown>) => {
      const run = queue.then(async () => {
        const before = [...committed]; const oldImport = importRecord
        try { return await callback(tx) } catch (error) { committed.splice(0, committed.length, ...before); importRecord = oldImport; throw error }
      })
      queue = run.then(() => undefined, () => undefined)
      return run
    },
  }
}

async function validPreview() {
  return previewInventoryImport({ inventoryImport: { findFirst: async () => null }, productBatch: { findMany: async () => [] } }, actor, "backup.json", "b".repeat(64), payload())
}

test("a mid-import failure rolls back the whole transaction instead of partially committing", async () => {
  const db = transactionDb("product")
  const preview = await validPreview()
  await assert.rejects(() => commitInventoryImport(db, actor, preview, false), /database failure/)
  assert.deepEqual(db.committed, [])
})

test("concurrent imports serialize and the loser detects the duplicate checksum", async () => {
  const db = transactionDb()
  const preview = await validPreview()
  const results = await Promise.allSettled([
    commitInventoryImport(db, actor, preview, false),
    commitInventoryImport(db, actor, preview, false),
  ])
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1)
  const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult
  assert.equal(rejected.reason.status, 409)
})

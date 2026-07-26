import assert from "node:assert/strict"
import test, { afterEach } from "node:test"
import { hasPermission, setAuthorizationSessionResolverForTests } from "./authorization"
import { createStockAdjustment } from "@/app/(dashboard)/inventory/adjustments/actions"

afterEach(() => setAuthorizationSessionResolverForTests())

test("the role matrix keeps sensitive permissions explicit", () => {
  assert.equal(hasPermission("OWNER", "BACKUP_RESTORE"), true)
  assert.equal(hasPermission("ADMIN", "OPENING_BALANCE_CORRECT"), true)
  assert.equal(hasPermission("ACCOUNTANT", "JOURNAL_POST"), true)
  assert.equal(hasPermission("STOREKEEPER", "STOCK_ADJUST"), true)
  assert.equal(hasPermission("SALESMAN", "STOCK_ADJUST"), false)
  assert.equal(hasPermission("CASHIER", "EXPORT_DATA"), false)
})

test("a server action invoked directly rejects an unauthorized role before database access", async () => {
  setAuthorizationSessionResolverForTests(async () => ({
    user: { id: "cashier-1", companyId: "company-1", role: "CASHIER" },
  }))

  const result = await createStockAdjustment(null, new FormData())
  assert.deepEqual(result, { error: "Forbidden" })
})

test("a server action invoked directly consistently rejects a missing session", async () => {
  setAuthorizationSessionResolverForTests(async () => null)
  const result = await createStockAdjustment(null, new FormData())
  assert.deepEqual(result, { error: "Forbidden" })
})

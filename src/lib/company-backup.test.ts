import assert from "node:assert/strict"
import test from "node:test"
import { BACKUP_COLLECTIONS, decryptBackup, encryptBackup, issueRestoreApproval, makeBackup, validateRestoredBackup, verifyBackup, verifyRestoreApproval, type BackupData } from "./company-backup"
const empty = () => Object.fromEntries(BACKUP_COLLECTIONS.map(k => [k, []])) as unknown as BackupData

test("encrypted versioned backup round-trips and detects tampering", () => {
  const data = empty(); data.company = [{ id: "c", name: "Test" }]
  const backup = makeBackup("c", "Test", data, new Date(0)); verifyBackup(backup)
  assert.deepEqual(decryptBackup(encryptBackup(backup, "a-long-test-secret"), "a-long-test-secret"), backup)
  backup.data.customers.push({ id: "bad" }); assert.throws(() => verifyBackup(backup), /count mismatch|checksum/i)
})

test("restore validation checks relationships, stock and journals", () => {
  const data = empty(); data.company=[{id:"c"}]; data.products=[{id:"p"}]; data.batches=[{id:"b",productId:"p",quantity:2}]
  data.stockMovements=[{id:"m",productId:"p",batchId:"b",quantity:2}]; data.accounts=[{id:"a"},{id:"z"}]
  data.journalEntries=[{id:"j"}]; data.journalLines=[{id:"l1",journalEntryId:"j",debitAccountId:"a",amount:10},{id:"l2",journalEntryId:"j",creditAccountId:"z",amount:10}]
  assert.equal(validateRestoredBackup(makeBackup("c","Test",data)).ok, true)
  data.stockMovements[0] = {...data.stockMovements[0] as object, quantity: 1}
  assert.equal(validateRestoredBackup(makeBackup("c","Test",data)).checks.stockTotals, false)
})

test("restore approvals are company/checksum bound and expire", () => {
 const token=issueRestoreApproval("sum","company","secret",0)
 assert.equal(verifyRestoreApproval(token,"sum","company","secret",1),true)
 assert.equal(verifyRestoreApproval(token,"other","company","secret",1),false)
 assert.equal(verifyRestoreApproval(token,"sum","company","secret",16*60_000),false)
})

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

export const BACKUP_SCHEMA = "poultry.company-backup"
export const BACKUP_SCHEMA_VERSION = 2
export const BACKUP_KDF = "scrypt" as const
export const BACKUP_CIPHER = "aes-256-gcm" as const

/** Tables are deliberately explicit: adding a tenant model requires a schema-version bump. */
export const BACKUP_COLLECTIONS = [
  "company", "users", "permissions", "documentSequences", "suppliers", "customers", "categories",
  "products", "batches", "stockMovements", "purchases", "purchaseItems", "purchaseReturns",
  "purchaseReturnItems", "invoices", "invoiceItems", "saleReturns", "saleReturnItems",
  "customerPayments", "supplierPayments", "accounts", "journalEntries", "journalLines", "pdcCheques",
  "expenses", "salesTargets", "routes", "routeVisits", "quotations", "quotationItems",
  "supplierPaymentSchedules", "invoiceDrafts", "auditLogs",
] as const

export type BackupCollection = typeof BACKUP_COLLECTIONS[number]
export type BackupData = Record<BackupCollection, unknown[]>
export type BackupManifest = {
  schema: typeof BACKUP_SCHEMA
  schemaVersion: number
  createdAt: string
  companyId: string
  companyName: string
  recordCounts: Record<BackupCollection, number>
  checksum: { algorithm: "sha256"; value: string }
}
export type PlainCompanyBackup = { manifest: BackupManifest; data: BackupData }
export type EncryptedCompanyBackup = {
  schema: typeof BACKUP_SCHEMA
  schemaVersion: number
  encrypted: true
  kdf: { name: typeof BACKUP_KDF; salt: string }
  cipher: { name: typeof BACKUP_CIPHER; iv: string; authTag: string }
  ciphertext: string
}

type Row = Record<string, unknown>
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
  return JSON.stringify(value)
}
export const payloadChecksum = (data: BackupData) => createHash("sha256").update(stable(data)).digest("hex")

export function makeBackup(companyId: string, companyName: string, data: BackupData, now = new Date()): PlainCompanyBackup {
  const recordCounts = Object.fromEntries(BACKUP_COLLECTIONS.map(k => [k, data[k].length])) as Record<BackupCollection, number>
  return { manifest: { schema: BACKUP_SCHEMA, schemaVersion: BACKUP_SCHEMA_VERSION, createdAt: now.toISOString(), companyId, companyName, recordCounts, checksum: { algorithm: "sha256", value: payloadChecksum(data) } }, data }
}

export function verifyBackup(value: unknown): asserts value is PlainCompanyBackup {
  const backup = value as PlainCompanyBackup
  if (!backup?.manifest || !backup.data || backup.manifest.schema !== BACKUP_SCHEMA) throw new Error("Unrecognised company backup format")
  if (backup.manifest.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error(`Unsupported backup schema version ${backup.manifest.schemaVersion}`)
  for (const name of BACKUP_COLLECTIONS) {
    if (!Array.isArray(backup.data[name])) throw new Error(`Missing backup collection: ${name}`)
    if (backup.manifest.recordCounts[name] !== backup.data[name].length) throw new Error(`Record count mismatch: ${name}`)
  }
  const actual = payloadChecksum(backup.data)
  const expected = backup.manifest.checksum?.value
  if (!expected || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) throw new Error("Backup checksum verification failed")
}

export function encryptBackup(backup: PlainCompanyBackup, secret: string): EncryptedCompanyBackup {
  if (secret.length < 12) throw new Error("Backup encryption secret must contain at least 12 characters")
  verifyBackup(backup)
  const salt = randomBytes(16), iv = randomBytes(12), key = scryptSync(secret, salt, 32)
  const cipher = createCipheriv(BACKUP_CIPHER, key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(backup)), cipher.final()])
  return { schema: BACKUP_SCHEMA, schemaVersion: BACKUP_SCHEMA_VERSION, encrypted: true, kdf: { name: BACKUP_KDF, salt: salt.toString("base64") }, cipher: { name: BACKUP_CIPHER, iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") }, ciphertext: ciphertext.toString("base64") }
}

export function decryptBackup(value: unknown, secret: string): PlainCompanyBackup {
  const envelope = value as EncryptedCompanyBackup
  if (!envelope?.encrypted || envelope.schema !== BACKUP_SCHEMA || envelope.kdf?.name !== BACKUP_KDF || envelope.cipher?.name !== BACKUP_CIPHER) throw new Error("Invalid encrypted backup envelope")
  const decipher = createDecipheriv(BACKUP_CIPHER, scryptSync(secret, Buffer.from(envelope.kdf.salt, "base64"), 32), Buffer.from(envelope.cipher.iv, "base64"))
  decipher.setAuthTag(Buffer.from(envelope.cipher.authTag, "base64"))
  const backup = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8"))
  verifyBackup(backup)
  return backup
}

const ids = (rows: unknown[]) => new Set((rows as Row[]).map(r => String(r.id)))
const decimal = (v: unknown) => Number(v ?? 0)
export type RestoreValidation = { ok: boolean; errors: string[]; checks: Record<string, boolean> }
export function validateRestoredBackup(backup: PlainCompanyBackup): RestoreValidation {
  verifyBackup(backup)
  const d = backup.data as Record<BackupCollection, Row[]>, errors: string[] = []
  const fk = (children: BackupCollection, field: string, parents: BackupCollection, optional = false) => {
    const parentIds = ids(d[parents])
    for (const row of d[children]) if (!(optional && (row[field] == null || row[field] === "")) && !parentIds.has(String(row[field]))) errors.push(`${children}.${field} references missing ${parents} record ${row[field]}`)
  }
  fk("products", "supplierId", "suppliers", true); fk("products", "categoryId", "categories", true); fk("batches", "productId", "products")
  fk("stockMovements", "productId", "products"); fk("stockMovements", "batchId", "batches", true)
  fk("purchases", "supplierId", "suppliers"); fk("purchaseItems", "purchaseOrderId", "purchases"); fk("purchaseItems", "productId", "products")
  fk("invoices", "customerId", "customers", true); fk("invoiceItems", "invoiceId", "invoices"); fk("invoiceItems", "productId", "products"); fk("invoiceItems", "batchId", "batches")
  fk("customerPayments", "customerId", "customers"); fk("supplierPayments", "supplierId", "suppliers")
  fk("journalLines", "journalEntryId", "journalEntries"); fk("journalLines", "debitAccountId", "accounts", true); fk("journalLines", "creditAccountId", "accounts", true)
  for (const batch of d.batches) {
    const movementTotal = d.stockMovements.filter(m => m.batchId === batch.id).reduce((n, m) => n + Number(m.quantity), 0)
    if (movementTotal !== Number(batch.quantity)) errors.push(`Batch ${batch.id} stock is ${batch.quantity}, movements total ${movementTotal}`)
  }
  for (const journal of d.journalEntries) {
    const lines = d.journalLines.filter(l => l.journalEntryId === journal.id)
    const debit = lines.reduce((n, l) => n + (l.debitAccountId ? decimal(l.amount) : 0), 0), credit = lines.reduce((n, l) => n + (l.creditAccountId ? decimal(l.amount) : 0), 0)
    if (Math.abs(debit - credit) > .005) errors.push(`Journal ${journal.id} is unbalanced (${debit} debit / ${credit} credit)`)
  }
  const customerBalances = d.customers.every(c => Number.isFinite(decimal(c.openingBalance) + d.invoices.filter(i => i.customerId === c.id).reduce((n,i)=>n+decimal(i.netAmount),0) - d.customerPayments.filter(p => p.customerId === c.id).reduce((n,p)=>n+decimal(p.amount),0) - d.saleReturns.filter(r=>r.customerId===c.id).reduce((n,r)=>n+decimal(r.totalAmount),0)))
  const supplierBalances = d.suppliers.every(s => Number.isFinite(decimal(s.openingBalance) + d.purchases.filter(p => p.supplierId === s.id).reduce((n,p)=>n+decimal(p.netAmount),0) - d.supplierPayments.filter(p=>p.supplierId===s.id && !p.isVoided).reduce((n,p)=>n+decimal(p.amount),0) - d.purchaseReturns.filter(r=>r.supplierId===s.id).reduce((n,r)=>n+decimal(r.totalAmount),0)))
  const checks = { checksum: true, foreignKeys: !errors.some(e => e.includes("references missing")), stockTotals: !errors.some(e => e.startsWith("Batch ")), customerBalances, supplierBalances, balancedJournals: !errors.some(e => e.startsWith("Journal ")) }
  return { ok: errors.length === 0 && Object.values(checks).every(Boolean), errors, checks }
}

export function issueRestoreApproval(checksum: string, companyId: string, secret: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ checksum, companyId, expiresAt: now + 15 * 60_000 })).toString("base64url")
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`
}
export function verifyRestoreApproval(token: string, checksum: string, companyId: string, secret: string, now = Date.now()) {
  const [body, signature] = token.split("."); if (!body || !signature) return false
  const actual = createHmac("sha256", secret).update(body).digest(); const supplied = Buffer.from(signature, "base64url")
  if (actual.length !== supplied.length || !timingSafeEqual(actual, supplied)) return false
  const value = JSON.parse(Buffer.from(body, "base64url").toString())
  return value.checksum === checksum && value.companyId === companyId && value.expiresAt >= now
}

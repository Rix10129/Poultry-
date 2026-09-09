import { Prisma, UnitType } from "@prisma/client"

const units = new Set(Object.values(UnitType))

export type ImportRow = {
  rowNumber: number
  sourceSupplierId: string | null
  supplierName: string
  productName: string
  unit: UnitType
  batchNumber: string
  manufactureDate: Date | null
  expiryDate: Date
  quantity: number
  purchasePrice: number
  salePrice: number
  warnings: string[]
  errors: string[]
}

export type ImportPreview = {
  checksum: string
  filename: string
  rows: ImportRow[]
  warnings: string[]
  duplicateFile: boolean
  valid: boolean
}

type Actor = { id: string; companyId: string }

function text(value: unknown) { return typeof value === "string" ? value.trim() : "" }
function finite(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : NaN }
function date(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Convert the nested JSON backup into independently validated opening-stock rows. */
export function parseImportRows(payload: unknown, companyId: string): ImportRow[] {
  const root = payload as Record<string, unknown> | null
  const src = ((root?.data as Record<string, unknown> | undefined) ?? root) as Record<string, unknown> | null
  const suppliers = Array.isArray(src?.suppliers) ? src.suppliers as Record<string, unknown>[] : []
  const products = Array.isArray(src?.products) ? src.products as Record<string, unknown>[] : []
  const supplierNames = new Map(suppliers.map(s => [text(s.id), text(s.name)]))
  const supplierCompanies = new Map(suppliers.map(s => [text(s.id), text(s.companyId)]))
  const rows: ImportRow[] = []

  for (const product of products) {
    const batches = Array.isArray(product.batches) ? product.batches as Record<string, unknown>[] : []
    for (const batch of batches) {
      const sourceSupplierId = text(product.supplierId) || null
      const supplierName = sourceSupplierId ? (supplierNames.get(sourceSupplierId) ?? "") : ""
      const quantity = finite(batch.quantity)
      const purchasePrice = finite(batch.purchasePrice ?? product.purchasePrice)
      const salePrice = finite(batch.salePrice ?? product.salePrice)
      const expiryDate = date(batch.expiryDate)
      const manufactureDate = batch.manufactureDate == null ? null : date(batch.manufactureDate)
      const unit = text(product.unit) as UnitType
      const row: ImportRow = {
        rowNumber: rows.length + 1, sourceSupplierId, supplierName,
        productName: text(product.name), unit,
        batchNumber: text(batch.batchNumber), manufactureDate,
        expiryDate: expiryDate ?? new Date(0), quantity, purchasePrice, salePrice,
        warnings: [], errors: [],
      }
      if (text(product.companyId) && text(product.companyId) !== companyId) row.errors.push("Product belongs to another company")
      if (text(batch.companyId) && text(batch.companyId) !== companyId) row.errors.push("Batch belongs to another company")
      if (sourceSupplierId && supplierCompanies.get(sourceSupplierId) && supplierCompanies.get(sourceSupplierId) !== companyId) row.errors.push("Supplier belongs to another company")
      if (!row.supplierName) row.errors.push("Supplier reference is missing or does not resolve within this file")
      if (!row.productName) row.errors.push("Product name is required")
      if (!units.has(unit)) row.errors.push(`Unsupported unit: ${unit || "(empty)"}`)
      if (!row.batchNumber) row.errors.push("Batch number is required")
      if (!expiryDate) row.errors.push("Expiry date is invalid")
      if (manufactureDate === null && batch.manufactureDate != null) row.errors.push("Manufacture date is invalid")
      if (manufactureDate && expiryDate && manufactureDate > expiryDate) row.errors.push("Manufacture date must not be after expiry date")
      if (!Number.isSafeInteger(quantity) || quantity <= 0) row.errors.push("Quantity must be a positive whole number")
      if (!Number.isFinite(purchasePrice) || purchasePrice < 0 || purchasePrice > 9_999_999_999.99) row.errors.push("Purchase price must be a valid non-negative amount")
      if (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > 9_999_999_999.99) row.errors.push("Sale price must be a valid non-negative amount")
      rows.push(row)
    }
  }
  return rows
}

export async function previewInventoryImport(db: any, actor: Actor, filename: string, checksum: string, payload: unknown): Promise<ImportPreview> {
  const rows = parseImportRows(payload, actor.companyId)
  const warnings: string[] = []
  if (!text(filename) || filename.length > 255) warnings.push("Source filename is missing or too long")
  if (!/^[a-f0-9]{64}$/.test(checksum)) warnings.push("File checksum is invalid")
  if (!rows.length) warnings.push("No positive-stock product batches were found")

  const duplicateFile = !!await db.inventoryImport.findFirst({ where: { companyId: actor.companyId, checksum }, select: { id: true } })
  if (duplicateFile) warnings.push("This exact file was imported before")

  const seen = new Set<string>()
  for (const row of rows) {
    const key = `${row.supplierName.toLocaleLowerCase()}\0${row.batchNumber.toLocaleLowerCase()}`
    if (seen.has(key)) row.warnings.push("Duplicate supplier/batch combination within this file")
    seen.add(key)
  }
  const existing = rows.length ? await db.productBatch.findMany({
    where: { companyId: actor.companyId, OR: rows.map(row => ({ batchNumber: row.batchNumber, product: { supplier: { name: row.supplierName } } })) },
    select: { batchNumber: true, product: { select: { name: true, supplier: { select: { name: true } } } } },
  }) : []
  for (const match of existing) {
    const row = rows.find(r => r.batchNumber === match.batchNumber && r.supplierName === match.product.supplier?.name)
    row?.warnings.push("Supplier/product/batch already exists; quantity will be added to it")
  }
  return { filename, checksum, rows, warnings, duplicateFile, valid: warnings.every(w => !w.includes("missing") && !w.includes("invalid") && !w.startsWith("No ")) && rows.every(r => !r.errors.length) }
}

export async function commitInventoryImport(db: any, actor: Actor, preview: ImportPreview, confirmDuplicates: boolean) {
  if (!preview.valid) throw new ImportProblem("Import contains validation errors", 422)
  if ((preview.duplicateFile || preview.rows.some(r => r.warnings.some(w => w.startsWith("Duplicate") || w.includes("already exists")))) && !confirmDuplicates) {
    throw new ImportProblem("Duplicate file or supplier/batch data requires explicit confirmation", 409)
  }
  const importId = crypto.randomUUID()
  return db.$transaction(async (tx: any) => {
    // Company-scoped advisory lock makes the duplicate check and writes atomic
    // across concurrent requests, while the Serializable level catches phantoms.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.companyId}))`
    const duplicate = await tx.inventoryImport.findFirst({ where: { companyId: actor.companyId, checksum: preview.checksum } })
    if (duplicate && !confirmDuplicates) throw new ImportProblem("This file was imported concurrently; confirmation is required", 409)
    await tx.inventoryImport.create({ data: { id: importId, companyId: actor.companyId, userId: actor.id, sourceFilename: preview.filename, checksum: preview.checksum } })

    for (const row of preview.rows) {
      let supplier = await tx.supplier.findFirst({ where: { companyId: actor.companyId, name: row.supplierName } })
      supplier ??= await tx.supplier.create({ data: { companyId: actor.companyId, name: row.supplierName } })
      let product = await tx.product.findFirst({ where: { companyId: actor.companyId, name: row.productName, supplierId: supplier.id } })
      product ??= await tx.product.create({ data: { companyId: actor.companyId, supplierId: supplier.id, name: row.productName, unit: row.unit, purchasePrice: row.purchasePrice, salePrice: row.salePrice } })
      let batch = await tx.productBatch.findUnique({ where: { batchNumber_productId_companyId: { companyId: actor.companyId, productId: product.id, batchNumber: row.batchNumber } } })
      const reused = !!batch
      batch = batch
        ? await tx.productBatch.update({ where: { id: batch.id }, data: { quantity: { increment: row.quantity }, initialQuantity: { increment: row.quantity } } })
        : await tx.productBatch.create({ data: { companyId: actor.companyId, productId: product.id, batchNumber: row.batchNumber, manufactureDate: row.manufactureDate, expiryDate: row.expiryDate, purchasePrice: row.purchasePrice, salePrice: row.salePrice, quantity: row.quantity, initialQuantity: row.quantity } })
      const opening = await tx.inventoryOpeningStock.create({ data: { companyId: actor.companyId, importId, productId: product.id, batchId: batch.id, quantity: row.quantity, unitCost: row.purchasePrice, totalValue: new Prisma.Decimal(row.purchasePrice).mul(row.quantity) } })
      await tx.stockMovement.create({ data: { companyId: actor.companyId, productId: product.id, batchId: batch.id, type: "ADJUSTMENT", quantity: row.quantity, reference: importId, sourceType: "OPENING_STOCK_IMPORT", sourceId: opening.id, notes: `Opening stock from ${preview.filename}` } })
      await tx.inventoryImportRow.create({ data: { importId, rowNumber: row.rowNumber, status: reused ? "REUSED" : "CREATED", supplierName: row.supplierName, productName: row.productName, batchNumber: row.batchNumber, quantity: row.quantity, purchasePrice: row.purchasePrice, salePrice: row.salePrice, result: { supplierId: supplier.id, productId: product.id, batchId: batch.id, openingStockId: opening.id } } })
    }
    return { importId, rows: preview.rows.length }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function rollbackInventoryImport(db: any, actor: Actor, importId: string, reason: string) {
  if (reason.trim().length < 5) throw new ImportProblem("A rollback reason of at least 5 characters is required", 422)
  return db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.companyId}))`
    const job = await tx.inventoryImport.findFirst({ where: { id: importId, companyId: actor.companyId }, include: { openingStocks: true } })
    if (!job) throw new ImportProblem("Import not found", 404)
    if (job.status === "ROLLED_BACK") throw new ImportProblem("Import was already rolled back", 409)
    for (const opening of job.openingStocks) {
      const batch = await tx.productBatch.findFirst({ where: { id: opening.batchId, companyId: actor.companyId } })
      if (!batch || batch.quantity < opening.quantity) throw new ImportProblem(`Cannot roll back: batch ${opening.batchId} no longer has enough stock`, 409)
      await tx.productBatch.update({ where: { id: batch.id }, data: { quantity: { decrement: opening.quantity }, initialQuantity: { decrement: opening.quantity } } })
      await tx.stockMovement.create({ data: { companyId: actor.companyId, productId: opening.productId, batchId: opening.batchId, type: "ADJUSTMENT", quantity: -opening.quantity, reference: importId, sourceType: "OPENING_STOCK_IMPORT_REVERSAL", sourceId: opening.id, notes: reason } })
      await tx.inventoryOpeningStock.update({ where: { id: opening.id }, data: { status: "REVERSED", reversedAt: new Date(), reversedBy: actor.id, reversalReason: reason } })
    }
    await tx.inventoryImport.update({ where: { id: importId }, data: { status: "ROLLED_BACK", rolledBackAt: new Date(), rolledBackBy: actor.id, rollbackReason: reason } })
    return { importId, reversedRows: job.openingStocks.length }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export class ImportProblem extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

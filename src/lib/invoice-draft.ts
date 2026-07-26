export const INVOICE_DRAFT_VERSION = 1 as const

export type InvoiceDraftLine = {
  productId: string
  productName: string
  unit: string
  batchId: string
  batchNumber: string
  expiryDate: string
  quantity: number
  salePrice: number
  discount: number
  taxRate: number
  savedAvailable: number
  savedCatalogPrice: number
}

export type InvoiceDraftData = {
  version: typeof INVOICE_DRAFT_VERSION
  customerId: string
  customerName: string | null
  invoiceDate: string
  dueDate: string
  paymentMode: string
  paidAmount: string
  discountAmount: string
  notes: string
  lines: InvoiceDraftLine[]
}

export type DraftSnapshot = {
  customers: Map<string, { name: string }>
  products: Map<string, { name: string; active: boolean; salePrice: number; taxRate: number }>
  batches: Map<string, { productId: string; batchNumber: string; quantity: number; salePrice: number; expiryDate: Date }>
}

/** Revalidates references and returns current values without silently changing the saved price. */
export function revalidateInvoiceDraft(data: InvoiceDraftData, current: DraftSnapshot, now = new Date()) {
  const warnings: string[] = []
  if (data.customerId) {
    const customer = current.customers.get(data.customerId)
    if (!customer) warnings.push(`Customer "${data.customerName ?? data.customerId}" is no longer available.`)
    else if (data.customerName && customer.name !== data.customerName) warnings.push(`Customer name changed from "${data.customerName}" to "${customer.name}".`)
  }

  const lines = data.lines.map((line) => {
    const product = current.products.get(line.productId)
    const batch = current.batches.get(line.batchId)
    if (!product || !product.active) warnings.push(`Product "${line.productName}" is no longer available.`)
    else {
      if (product.name !== line.productName) warnings.push(`Product "${line.productName}" is now named "${product.name}".`)
      if (product.salePrice !== line.savedCatalogPrice) warnings.push(`${product.name}'s catalog price changed from ${line.savedCatalogPrice} to ${product.salePrice}.`)
      if (product.taxRate !== line.taxRate) warnings.push(`${product.name}'s tax rate changed from ${line.taxRate}% to ${product.taxRate}%.`)
    }
    if (!batch || batch.productId !== line.productId) warnings.push(`Batch "${line.batchNumber}" for ${line.productName} is no longer available.`)
    else {
      if (batch.batchNumber !== line.batchNumber) warnings.push(`Batch "${line.batchNumber}" is now named "${batch.batchNumber}".`)
      if (batch.quantity !== line.savedAvailable) warnings.push(`${line.productName} batch ${batch.batchNumber} availability changed from ${line.savedAvailable} to ${batch.quantity}.`)
      if (batch.salePrice !== line.salePrice) warnings.push(`${line.productName} batch price changed from ${line.salePrice} to ${batch.salePrice}.`)
      if (batch.expiryDate.getTime() < now.getTime()) warnings.push(`${line.productName} batch ${batch.batchNumber} has expired.`)
    }
    return { ...line, maxQty: batch?.quantity ?? 0 }
  })
  return { data: { ...data, lines }, warnings }
}

export function parseInvoiceDraft(value: unknown): InvoiceDraftData {
  if (!value || typeof value !== "object" || (value as { version?: number }).version !== INVOICE_DRAFT_VERSION) {
    throw new Error("This draft format is not supported")
  }
  const draft = value as InvoiceDraftData
  if (!Array.isArray(draft.lines)) throw new Error("Draft line data is invalid")
  return draft
}

type DraftRepository = {
  invoiceDraft: {
    updateMany(args: unknown): Promise<{ count: number }>
    findUnique(args: unknown): Promise<{ id: string; updatedAt: Date } | null>
    create(args: unknown): Promise<{ id: string; updatedAt: Date }>
  }
}

/** Persistence boundary kept intentionally narrow so saving can never post side effects. */
export async function persistInvoiceDraft(repository: DraftRepository, owner: { companyId: string; userId: string }, data: InvoiceDraftData & { id?: string }) {
  const parsed = parseInvoiceDraft(data)
  if (data.id) {
    const result = await repository.invoiceDraft.updateMany({ where: { id: data.id, ...owner }, data: { version: INVOICE_DRAFT_VERSION, data: parsed } })
    if (!result.count) throw new Error("Draft not found")
    return repository.invoiceDraft.findUnique({ where: { id: data.id } })
  }
  return repository.invoiceDraft.create({ data: { ...owner, version: INVOICE_DRAFT_VERSION, data: parsed } })
}

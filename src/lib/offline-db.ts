export interface SaleInvoiceDraft {
  id: string
  customerId: string
  invoiceDate: string
  dueDate: string
  paymentMode: string
  paidAmount: string
  discountAmount: string
  notes: string
  linesJson: string
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export interface QueuedSale {
  id: string
  customerId: string
  invoiceDate: string
  dueDate: string
  paymentMode: string
  paidAmount: string
  discountAmount: string
  notes: string
  linesJson: string
  queuedAt: string
  status: "pending" | "syncing" | "failed"
  errorMessage?: string
}

const DB_NAME = "pvs-offline"
const DB_VERSION = 3  // v3 adds sale invoice drafts

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains("sales_queue")) {
        const store = db.createObjectStore("sales_queue", { keyPath: "id" })
        store.createIndex("status", "status", { unique: false })
      }
      if (!db.objectStoreNames.contains("kv_cache")) {
        db.createObjectStore("kv_cache", { keyPath: "key" })
      }
      if (!db.objectStoreNames.contains("sale_invoice_drafts")) {
        const store = db.createObjectStore("sale_invoice_drafts", { keyPath: "id" })
        store.createIndex("updatedAt", "updatedAt", { unique: false })
        store.createIndex("expiresAt", "expiresAt", { unique: false })
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error)
  })
}

// ── KV cache — stores customers + products for offline invoice creation ────────

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv_cache", "readwrite")
    const req = tx.objectStore("kv_cache").put({ key, value, savedAt: Date.now() })
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv_cache", "readonly")
    const req = tx.objectStore("kv_cache").get(key)
    req.onsuccess = () => resolve(req.result?.value ?? null)
    req.onerror = () => reject(req.error)
  })
}

// ── Sales queue ───────────────────────────────────────────────────────────────

export async function addToSalesQueue(
  sale: Omit<QueuedSale, "id" | "queuedAt" | "status">
): Promise<string> {
  const db = await openDB()
  const id = crypto.randomUUID()
  const item: QueuedSale = {
    ...sale,
    id,
    queuedAt: new Date().toISOString(),
    status: "pending",
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sales_queue", "readwrite")
    const req = tx.objectStore("sales_queue").add(item)
    req.onsuccess = () => resolve(id)
    req.onerror = () => reject(req.error)
  })
}

export async function getPendingSales(): Promise<QueuedSale[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sales_queue", "readonly")
    const req = tx.objectStore("sales_queue").index("status").getAll("pending")
    req.onsuccess = () => resolve(req.result as QueuedSale[])
    req.onerror = () => reject(req.error)
  })
}

export async function getQueueCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sales_queue", "readonly")
    const req = tx.objectStore("sales_queue").index("status").count("pending")
    req.onsuccess = () => resolve(req.result as number)
    req.onerror = () => reject(req.error)
  })
}

export async function updateQueuedSale(
  id: string,
  patch: Partial<QueuedSale>
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sales_queue", "readwrite")
    const store = tx.objectStore("sales_queue")
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const existing = getReq.result as QueuedSale
      if (!existing) { resolve(); return }
      const putReq = store.put({ ...existing, ...patch })
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sales_queue", "readwrite")
    const req = tx.objectStore("sales_queue").delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}


// ── Invoice drafts (client-side IndexedDB, expires after 30 days) ─────────────

const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000

export async function saveInvoiceDraft(
  draft: Omit<SaleInvoiceDraft, "id" | "createdAt" | "updatedAt" | "expiresAt"> & { id?: string }
): Promise<string> {
  const db = await openDB()
  const now = new Date()
  const id = draft.id || crypto.randomUUID()
  const existing = draft.id ? await getInvoiceDraft(draft.id) : null
  const item: SaleInvoiceDraft = {
    ...draft,
    id,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DRAFT_TTL_MS).toISOString(),
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction("sale_invoice_drafts", "readwrite")
    const req = tx.objectStore("sale_invoice_drafts").put(item)
    req.onsuccess = () => resolve(id)
    req.onerror = () => reject(req.error)
  })
}

export async function getInvoiceDraft(id: string): Promise<SaleInvoiceDraft | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sale_invoice_drafts", "readonly")
    const req = tx.objectStore("sale_invoice_drafts").get(id)
    req.onsuccess = () => resolve((req.result as SaleInvoiceDraft | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function getInvoiceDrafts(): Promise<SaleInvoiceDraft[]> {
  await cleanupExpiredInvoiceDrafts()
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sale_invoice_drafts", "readonly")
    const req = tx.objectStore("sale_invoice_drafts").getAll()
    req.onsuccess = () => {
      const drafts = (req.result as SaleInvoiceDraft[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      resolve(drafts)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function removeInvoiceDraft(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sale_invoice_drafts", "readwrite")
    const req = tx.objectStore("sale_invoice_drafts").delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function cleanupExpiredInvoiceDrafts(now = new Date()): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sale_invoice_drafts", "readwrite")
    const store = tx.objectStore("sale_invoice_drafts")
    const req = store.getAll()
    req.onsuccess = () => {
      const expired = (req.result as SaleInvoiceDraft[]).filter(draft => new Date(draft.expiresAt) <= now)
      for (const draft of expired) store.delete(draft.id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
    req.onerror = () => reject(req.error)
  })
}

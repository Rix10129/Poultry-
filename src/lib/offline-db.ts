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
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains("sales_queue")) {
        const store = db.createObjectStore("sales_queue", { keyPath: "id" })
        store.createIndex("status", "status", { unique: false })
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error)
  })
}

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

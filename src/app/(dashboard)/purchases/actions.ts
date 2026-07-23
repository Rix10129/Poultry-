"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { MovementType } from "@prisma/client"
import { logAudit } from "@/lib/audit"

type ActionState = { error: string } | null

export async function deletePurchase(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string
  const id = (formData.get("id") as string)?.trim()

  try {
    await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id, companyId },
        include: { items: { include: { batch: true } }, payments: true },
      })
      if (!po) throw new Error("Purchase order not found")
      if (po.payments.length > 0)
        throw new Error("Cannot delete — this order has recorded payments. Remove payments first.")

      for (const item of po.items) {
        if (!item.batch) continue
        const sold = item.batch.initialQuantity - item.batch.quantity
        if (sold > 0)
          throw new Error(
            `Cannot delete — ${sold} unit(s) from this order have already been sold. Create a purchase return instead.`
          )
      }

      await tx.stockMovement.deleteMany({ where: { reference: po.poNumber } })

      for (const item of po.items) {
        if (item.batchId) {
          await tx.productBatch.delete({ where: { id: item.batchId } })
        }
      }

      await tx.purchaseOrder.delete({ where: { id } })
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to delete purchase order" }
  }

  revalidatePath("/purchases")
  revalidatePath("/inventory")
  redirect("/purchases")
}

type PurchaseReturnLine = {
  productId: string
  batchId: string
  quantity: number
  purchasePrice: number
}

export async function createPurchaseReturn(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const supplierId = (formData.get("supplierId") as string)?.trim()
  if (!supplierId) return { error: "Supplier is required" }
  const purchaseOrderId = (formData.get("purchaseOrderId") as string) || null
  const returnDate = (formData.get("returnDate") as string) || new Date().toISOString()
  const notes = (formData.get("notes") as string)?.trim() || null
  const linesJson = formData.get("linesJson") as string

  if (!linesJson) return { error: "No items provided" }
  let lines: PurchaseReturnLine[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: "Invalid items data" }
  }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one item" }

  const supplier = await db.supplier.findFirst({ where: { id: supplierId, companyId } })
  if (!supplier) return { error: "Supplier not found" }

  let returnId = ""

  try {
    await db.$transaction(async (tx) => {
      const count = await tx.purchaseReturn.count({ where: { companyId } })
      const year = new Date().getFullYear()
      const returnNumber = `PR-${year}-${String(count + 1).padStart(5, "0")}`

      const totalAmount = lines.reduce((s, l) => s + l.quantity * l.purchasePrice, 0)

      const ret = await tx.purchaseReturn.create({
        data: {
          companyId,
          supplierId,
          purchaseOrderId: purchaseOrderId || null,
          returnNumber,
          returnDate: new Date(returnDate),
          totalAmount,
          notes,
        },
      })
      returnId = ret.id

      for (const line of lines) {
        const batch = await tx.productBatch.findFirst({
          where: { id: line.batchId, companyId, productId: line.productId },
        })
        if (!batch) throw new Error("Batch not found")
        if (batch.quantity < line.quantity)
          throw new Error(`Insufficient stock in batch — only ${batch.quantity} available`)

        await tx.purchaseReturnItem.create({
          data: {
            purchaseReturnId: ret.id,
            productId: line.productId,
            batchId: line.batchId,
            quantity: line.quantity,
            purchasePrice: line.purchasePrice,
            totalAmount: line.quantity * line.purchasePrice,
          },
        })

        await tx.productBatch.update({
          where: { id: line.batchId },
          data: { quantity: { decrement: line.quantity } },
        })

        await tx.stockMovement.create({
          data: {
            companyId,
            productId: line.productId,
            batchId: line.batchId,
            type: MovementType.PURCHASE_RETURN,
            quantity: -line.quantity,
            reference: returnNumber,
            notes: `Purchase Return ${returnNumber}`,
          },
        })
      }
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to create purchase return" }
  }

  revalidatePath("/purchases/returns")
  revalidatePath("/inventory")
  redirect(`/purchases/returns/${returnId}`)
}

type LineInput = {
  productId: string
  batchNumber: string
  manufactureDate: string | null
  expiryDate: string
  quantity: number
  purchasePrice: number
  salePrice: number
  discount: number
  taxRate: number
}

export async function createPurchase(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const userId = user.id as string

  const supplierId = (formData.get("supplierId") as string)?.trim()
  if (!supplierId) return { error: "Supplier is required" }

  const orderDate = (formData.get("orderDate") as string) || new Date().toISOString()
  const paidAmount = Math.max(0, parseFloat(formData.get("paidAmount") as string) || 0)
  const discountAmount = Math.max(0, parseFloat(formData.get("discountAmount") as string) || 0)
  const notes = (formData.get("notes") as string)?.trim() || null
  const linesJson = formData.get("linesJson") as string

  if (!linesJson) return { error: "No line items provided" }

  let lines: LineInput[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: "Invalid line data" }
  }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one line item" }

  // Validate each line
  for (const line of lines) {
    if (!line.batchNumber?.trim()) return { error: "Batch number is required for all lines" }
    if (!line.expiryDate) return { error: "Expiry date is required for all lines" }
    if (!line.quantity || line.quantity < 1) return { error: "Quantity must be at least 1" }
    if (!line.purchasePrice || line.purchasePrice < 0) return { error: "Invalid purchase price" }
    if (!line.salePrice || line.salePrice < 0) return { error: "Invalid sale price" }
  }

  // Verify supplier belongs to company
  const supplier = await db.supplier.findFirst({ where: { id: supplierId, companyId } })
  if (!supplier) return { error: "Supplier not found" }

  let purchaseId = ""

  try {
    await db.$transaction(async (tx) => {
      // Generate sequential PO number
      const count = await tx.purchaseOrder.count({ where: { companyId } })
      const year = new Date().getFullYear()
      const poNumber = `PO-${year}-${String(count + 1).padStart(5, "0")}`

      // Compute totals
      let totalAmount = 0
      let taxAmount = 0
      for (const line of lines) {
        const lineBase = line.quantity * line.purchasePrice * (1 - line.discount / 100)
        totalAmount += lineBase
        taxAmount += lineBase * line.taxRate / 100
      }
      const netAmount = Math.max(0, totalAmount - discountAmount + taxAmount)

      // Create purchase order
      const po = await tx.purchaseOrder.create({
        data: {
          companyId,
          supplierId,
          userId,
          poNumber,
          orderDate: new Date(orderDate),
          totalAmount,
          discountAmount,
          taxAmount,
          netAmount,
          paidAmount: Math.min(paidAmount, netAmount + 0.001),
          notes,
        },
      })

      purchaseId = po.id

      // Process each line: create batch, link to PO item, record movement
      for (const line of lines) {
        const lineTotal =
          line.quantity * line.purchasePrice * (1 - line.discount / 100)

        // Create the batch — each purchase line always creates a fresh batch
        const batch = await tx.productBatch.create({
          data: {
            companyId,
            productId: line.productId,
            batchNumber: line.batchNumber.trim(),
            expiryDate: new Date(line.expiryDate),
            manufactureDate: line.manufactureDate ? new Date(line.manufactureDate) : null,
            purchasePrice: line.purchasePrice,
            salePrice: line.salePrice,
            quantity: line.quantity,
            initialQuantity: line.quantity,
          },
        })

        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: po.id,
            productId: line.productId,
            batchId: batch.id,
            quantity: line.quantity,
            purchasePrice: line.purchasePrice,
            discount: line.discount,
            taxRate: line.taxRate,
            totalAmount: lineTotal,
          },
        })

        await tx.stockMovement.create({
          data: {
            companyId,
            productId: line.productId,
            batchId: batch.id,
            type: MovementType.PURCHASE,
            quantity: line.quantity,
            reference: poNumber,
            notes: `Purchase ${poNumber}`,
          },
        })
      }
    })
  } catch (e: any) {
    // Catch unique constraint on batch number
    if (e?.code === "P2002") {
      return { error: "A batch with that number already exists for one of the selected products" }
    }
    return { error: e?.message ?? "Failed to create purchase order" }
  }

  revalidatePath("/purchases")
  revalidatePath("/inventory")
  revalidatePath("/alerts")
  redirect(`/purchases/${purchaseId}`)
}

export async function updatePurchaseOrder(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  if (user.role !== "OWNER" && user.role !== "ADMIN") return { error: "Access denied" }
  const companyId = user.companyId as string
  const id = (formData.get("id") as string)?.trim()
  const supplierId = (formData.get("supplierId") as string)?.trim()
  const orderDate = (formData.get("orderDate") as string) || new Date().toISOString()
  const paidAmount = Math.max(0, parseFloat(formData.get("paidAmount") as string) || 0)
  const discountAmount = Math.max(0, parseFloat(formData.get("discountAmount") as string) || 0)
  const notes = (formData.get("notes") as string)?.trim() || null
  const linesJson = formData.get("linesJson") as string
  let lines: LineInput[]
  try { lines = JSON.parse(linesJson) } catch { return { error: "Invalid line data" } }
  if (!id || !supplierId) return { error: "Purchase and supplier are required" }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one line item" }
  try {
    await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id, companyId }, include: { items: { include: { batch: true } }, payments: true, returns: true } })
      if (!po) throw new Error("Purchase order not found")
      if (po.payments.length || po.returns.length) throw new Error("Cannot edit purchase orders after payments or returns")
      for (const item of po.items) if (item.batch && item.batch.initialQuantity !== item.batch.quantity) throw new Error("Cannot edit after stock from this purchase has moved")
      await tx.stockMovement.deleteMany({ where: { reference: po.poNumber } })
      for (const item of po.items) if (item.batchId) await tx.productBatch.delete({ where: { id: item.batchId } })
      let totalAmount = 0, taxAmount = 0
      for (const line of lines) { const base = line.quantity * line.purchasePrice * (1 - line.discount / 100); totalAmount += base; taxAmount += base * line.taxRate / 100 }
      const netAmount = Math.max(0, totalAmount - discountAmount + taxAmount)
      await tx.purchaseOrder.update({ where: { id }, data: { supplierId, orderDate: new Date(orderDate), totalAmount, discountAmount, taxAmount, netAmount, paidAmount: Math.min(paidAmount, netAmount + 0.001), notes } })
      for (const line of lines) {
        const batch = await tx.productBatch.create({ data: { companyId, productId: line.productId, batchNumber: line.batchNumber.trim(), expiryDate: new Date(line.expiryDate), manufactureDate: line.manufactureDate ? new Date(line.manufactureDate) : null, purchasePrice: line.purchasePrice, salePrice: line.salePrice, quantity: line.quantity, initialQuantity: line.quantity } })
        await tx.purchaseOrderItem.create({ data: { purchaseOrderId: id, productId: line.productId, batchId: batch.id, quantity: line.quantity, purchasePrice: line.purchasePrice, discount: line.discount, taxRate: line.taxRate, totalAmount: line.quantity * line.purchasePrice * (1 - line.discount / 100) } })
        await tx.stockMovement.create({ data: { companyId, productId: line.productId, batchId: batch.id, type: MovementType.PURCHASE, quantity: line.quantity, reference: po.poNumber, notes: `Purchase ${po.poNumber} edited` } })
      }
    })
  } catch (e: any) { if (e?.code === "P2002") return { error: "A batch with that number already exists" }; return { error: e?.message ?? "Failed to update purchase order" } }
  logAudit({ companyId, userId: user.id, userName: user.name ?? "", action: "UPDATE_PURCHASE", entityId: id, detail: "Purchase order updated" })
  revalidatePath("/purchases"); revalidatePath("/inventory"); revalidatePath(`/purchases/${id}`); redirect(`/purchases/${id}`)
}

"use server"

import { db } from "@/lib/db"
import { allocateDocumentNumber } from "@/lib/document-number"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { MovementType } from "@prisma/client"
import { postPurchase, postPurchaseReturn, reversePosting } from "@/lib/accounting/posting-service"
import { assertDocumentCanBeDeleted, recordReversalAudit, requireReversalReason } from "@/lib/document-lifecycle"
import { authorize, forbiddenAction } from "@/lib/authorization"

type ActionState = { error: string } | null

export async function deletePurchase(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const authorization = await authorize("PURCHASE_CANCEL")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId
  const id = (formData.get("id") as string)?.trim()

  try {
    await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id, companyId },
        include: { items: true, payments: true, returns: true },
      })
      if (!po) throw new Error("Purchase order not found")
      const postings = await tx.journalEntry.count({ where: { companyId, sourceType: "PURCHASE", sourceId: id } })
      assertDocumentCanBeDeleted(po.status, { stockMovements: po.items.length, payments: po.payments.length, returns: po.returns.length, journalEntries: postings })
      await tx.purchaseOrder.delete({ where: { id } })
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to delete purchase order" }
  }

  revalidatePath("/purchases")
  revalidatePath("/inventory")
  redirect("/purchases")
}

export async function reversePurchase(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const authorization = await authorize("PURCHASE_CANCEL")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId; const id = String(formData.get("id") || "").trim()
  let reason: string; try { reason = requireReversalReason(formData.get("reason")) } catch (e) { return { error: (e as Error).message } }
  try { await db.$transaction(async tx => {
    const po = await tx.purchaseOrder.findFirst({ where: { id, companyId }, include: { items: { include: { batch: true } }, payments: true, returns: true } })
    if (!po) throw new Error("Purchase order not found")
    if (po.status !== "POSTED") throw new Error("Only posted purchases can be reversed")
    if (po.payments.length || po.returns.length) throw new Error("Reverse linked payments and returns before reversing this purchase")
    for (const item of po.items) {
      if (!item.batchId || !item.batch || item.batch.quantity < item.quantity) throw new Error("Purchase stock has been consumed; create returns for dependent sales first")
      await tx.productBatch.update({ where: { id: item.batchId }, data: { quantity: { decrement: item.quantity } } })
      await tx.stockMovement.create({ data: { companyId, productId: item.productId, batchId: item.batchId, type: MovementType.PURCHASE_RETURN, quantity: -item.quantity, reference: `REV-${po.poNumber}`, sourceType: "PURCHASE_REVERSAL", sourceId: po.id, notes: reason } })
    }
    const journal = await reversePosting(tx, companyId, "PURCHASE", id, reason); if (!journal) throw new Error("Purchase accounting entry was not found")
    await tx.purchaseOrder.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversedBy: user.id, reversalReason: reason } })
    await recordReversalAudit(tx, { companyId, userId: user.id, userName: user.name ?? "", entity: "PurchaseOrder", originalDocumentId: id, reversalDocumentId: journal.id, reason })
  }) } catch (e) { return { error: e instanceof Error ? e.message : "Failed to reverse purchase" } }
  revalidatePath("/purchases"); revalidatePath("/inventory"); redirect(`/purchases/${id}`)
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
      const returnDateValue = new Date(returnDate)
      const returnNumber = await allocateDocumentNumber(tx, companyId, "PURCHASE_RETURN", returnDateValue)

      const totalAmount = lines.reduce((s, l) => s + l.quantity * l.purchasePrice, 0)

      const ret = await tx.purchaseReturn.create({
        data: {
          status: "POSTED",
          companyId,
          supplierId,
          purchaseOrderId: purchaseOrderId || null,
          returnNumber,
          returnDate: returnDateValue,
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
            sourceType: "PURCHASE_RETURN",
            sourceId: ret.id,
            quantity: -line.quantity,
            reference: returnNumber,
            notes: `Purchase Return ${returnNumber}`,
          },
        })
      }
      await postPurchaseReturn(tx, { companyId, sourceId: ret.id, number: returnNumber, date: ret.returnDate, amount: ret.totalAmount })
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
  const authorization = await authorize("PURCHASE_CREATE")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId
  const userId = user.id

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
      const orderDateValue = new Date(orderDate)
      const poNumber = await allocateDocumentNumber(tx, companyId, "PURCHASE_ORDER", orderDateValue)

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
          status: "POSTED",
          companyId,
          supplierId,
          userId,
          poNumber,
          orderDate: orderDateValue,
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
            sourceType: "PURCHASE",
            sourceId: po.id,
            quantity: line.quantity,
            reference: poNumber,
            notes: `Purchase ${poNumber}`,
          },
        })
      }
      await postPurchase(tx, { companyId, sourceId: po.id, number: poNumber, date: po.orderDate, amount: po.netAmount, tax: po.taxAmount, paid: po.paidAmount, paymentMode: "CASH" })
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

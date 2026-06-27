"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { MovementType } from "@prisma/client"

type ActionState = { error: string } | null

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

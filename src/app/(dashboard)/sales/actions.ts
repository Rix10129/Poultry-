"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { MovementType, PaymentMode } from "@prisma/client"

type ActionState = { error: string } | null

type LineInput = {
  productId: string
  batchId: string
  quantity: number
  salePrice: number
  discount: number
  taxRate: number
}

const VALID_PAYMENT_MODES = ["CASH", "BANK", "CHEQUE", "CREDIT"] as const

export async function createInvoice(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const userId = user.id as string

  const customerId = (formData.get("customerId") as string) || null
  const invoiceDate = (formData.get("invoiceDate") as string) || new Date().toISOString()
  const dueDate = (formData.get("dueDate") as string) || null
  const paymentModeRaw = (formData.get("paymentMode") as string) || "CASH"
  const paidAmount = Math.max(0, parseFloat(formData.get("paidAmount") as string) || 0)
  const discountAmount = Math.max(0, parseFloat(formData.get("discountAmount") as string) || 0)
  const notes = (formData.get("notes") as string) || null
  const linesJson = formData.get("linesJson") as string

  if (!linesJson) return { error: "No line items provided" }
  if (!VALID_PAYMENT_MODES.includes(paymentModeRaw as any)) return { error: "Invalid payment mode" }

  let lines: LineInput[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: "Invalid line data" }
  }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one line item" }

  let invoiceId = ""

  try {
    await db.$transaction(async (tx) => {
      // Generate sequential invoice number within this transaction (safe from races)
      const count = await tx.saleInvoice.count({ where: { companyId } })
      const year = new Date().getFullYear()
      const invoiceNumber = `INV-${year}-${String(count + 1).padStart(5, "0")}`

      // Compute totals
      let totalAmount = 0
      let taxAmount = 0
      for (const line of lines) {
        const lineBase = line.quantity * line.salePrice * (1 - line.discount / 100)
        totalAmount += lineBase
        taxAmount += lineBase * line.taxRate / 100
      }
      const netAmount = Math.max(0, totalAmount - discountAmount + taxAmount)

      // Create invoice
      const invoice = await tx.saleInvoice.create({
        data: {
          companyId,
          userId,
          customerId: customerId || null,
          invoiceNumber,
          invoiceDate: new Date(invoiceDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          totalAmount,
          discountAmount,
          taxAmount,
          netAmount,
          paidAmount: Math.min(paidAmount, netAmount + 0.001),
          paymentMode: paymentModeRaw as PaymentMode,
          isCashSale: !customerId,
          notes: notes || null,
        },
      })

      invoiceId = invoice.id

      // Process each line item
      for (const line of lines) {
        // Verify batch belongs to company and the right product
        const batch = await tx.productBatch.findFirst({
          where: { id: line.batchId, companyId, productId: line.productId },
        })
        if (!batch) throw new Error(`Batch not found`)
        if (batch.quantity < line.quantity) {
          throw new Error(`Insufficient stock: ${batch.quantity} available, ${line.quantity} requested`)
        }

        const lineTotal = line.quantity * line.salePrice * (1 - line.discount / 100)

        await tx.saleInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            productId: line.productId,
            batchId: line.batchId,
            quantity: line.quantity,
            salePrice: line.salePrice,
            discount: line.discount,
            taxRate: line.taxRate,
            totalAmount: lineTotal,
          },
        })

        // Deduct from batch
        await tx.productBatch.update({
          where: { id: line.batchId },
          data: { quantity: { decrement: line.quantity } },
        })

        // Record stock movement (negative = stock out)
        await tx.stockMovement.create({
          data: {
            companyId,
            productId: line.productId,
            batchId: line.batchId,
            type: MovementType.SALE,
            quantity: -line.quantity,
            reference: invoiceNumber,
            notes: `Sale ${invoiceNumber}`,
          },
        })
      }
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to create invoice" }
  }

  revalidatePath("/sales")
  revalidatePath("/inventory")
  revalidatePath("/alerts")
  redirect(`/sales/${invoiceId}`)
}

"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { MovementType, PaymentMode } from "@prisma/client"
import { writeAuditLog, logAudit } from "@/lib/audit"

type ActionState = { error: string } | null

export async function deleteInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string
  const id = (formData.get("id") as string)?.trim()

  let invoiceNumber = ""
  try {
    await db.$transaction(async (tx) => {
      const invoice = await tx.saleInvoice.findFirst({
        where: { id, companyId },
        include: { items: true, payments: true },
      })
      if (!invoice) throw new Error("Invoice not found")
      if (invoice.payments.length > 0)
        throw new Error("Cannot delete — this invoice has recorded payments. Delete the payments first.")
      invoiceNumber = invoice.invoiceNumber

      for (const item of invoice.items) {
        await tx.productBatch.update({
          where: { id: item.batchId },
          data: { quantity: { increment: item.quantity } },
        })
      }
      await tx.stockMovement.deleteMany({ where: { reference: invoice.invoiceNumber } })
      await tx.saleInvoice.delete({ where: { id } })
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to delete invoice" }
  }

  await writeAuditLog({
    companyId,
    userId: user.id,
    action: "DELETE",
    entity: "SaleInvoice",
    entityId: id,
    oldValues: { invoiceNumber },
  })

  revalidatePath("/sales")
  revalidatePath("/inventory")
  redirect("/sales")
}

type ReturnLineInput = {
  productId: string
  batchId: string
  quantity: number
  salePrice: number
}

export async function createSaleReturn(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const customerId = (formData.get("customerId") as string) || null
  const invoiceId = (formData.get("invoiceId") as string) || null
  const returnDate = (formData.get("returnDate") as string) || new Date().toISOString()
  const notes = (formData.get("notes") as string)?.trim() || null
  const linesJson = formData.get("linesJson") as string

  if (!linesJson) return { error: "No items provided" }
  let lines: ReturnLineInput[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: "Invalid items data" }
  }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one item" }

  let returnId = ""

  try {
    await db.$transaction(async (tx) => {
      const count = await tx.saleReturn.count({ where: { companyId } })
      const year = new Date().getFullYear()
      const returnNumber = `SR-${year}-${String(count + 1).padStart(5, "0")}`

      const totalAmount = lines.reduce((s, l) => s + l.quantity * l.salePrice, 0)

      const ret = await tx.saleReturn.create({
        data: {
          companyId,
          customerId: customerId || null,
          invoiceId: invoiceId || null,
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

        await tx.saleReturnItem.create({
          data: {
            saleReturnId: ret.id,
            productId: line.productId,
            batchId: line.batchId,
            quantity: line.quantity,
            salePrice: line.salePrice,
            totalAmount: line.quantity * line.salePrice,
          },
        })

        await tx.productBatch.update({
          where: { id: line.batchId },
          data: { quantity: { increment: line.quantity } },
        })

        await tx.stockMovement.create({
          data: {
            companyId,
            productId: line.productId,
            batchId: line.batchId,
            type: MovementType.SALE_RETURN,
            quantity: line.quantity,
            reference: returnNumber,
            notes: `Sale Return ${returnNumber}`,
          },
        })
      }
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to create sale return" }
  }

  revalidatePath("/sales/returns")
  revalidatePath("/inventory")
  redirect(`/sales/returns/${returnId}`)
}

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
  const schemeNotes = (formData.get("schemeNotes") as string) || null
  const notes = (formData.get("notes") as string) || null
  const linesJson = formData.get("linesJson") as string
  const bypassCreditLimit = formData.get("bypassCreditLimit") === "1"

  if (!linesJson) return { error: "No line items provided" }
  if (!VALID_PAYMENT_MODES.includes(paymentModeRaw as any)) return { error: "Invalid payment mode" }

  let lines: LineInput[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: "Invalid line data" }
  }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one line item" }

  // Credit limit check
  if (customerId && !bypassCreditLimit) {
    const customer = await db.customer.findFirst({
      where: { id: customerId, companyId },
      select: { creditLimit: true, name: true },
    })
    if (customer) {
      const creditLimit = parseFloat(customer.creditLimit.toString())
      if (creditLimit > 0) {
        const invoiceAgg = await db.saleInvoice.aggregate({
          where: { customerId, companyId },
          _sum: { netAmount: true, paidAmount: true },
        })
        const outstanding = (parseFloat(invoiceAgg._sum.netAmount?.toString() ?? "0")) -
                            (parseFloat(invoiceAgg._sum.paidAmount?.toString() ?? "0"))

        // Estimate new invoice net amount from lines
        let estTotal = 0
        for (const l of lines) {
          estTotal += l.quantity * l.salePrice * (1 - (l.discount ?? 0) / 100)
        }
        const estNet = Math.max(0, estTotal - discountAmount)

        if (outstanding + estNet > creditLimit) {
          const role = user.role as string
          if (role !== "OWNER" && role !== "ADMIN") {
            return {
              error: `Credit limit exceeded. ${customer.name} has PKR ${outstanding.toLocaleString()} outstanding against a limit of PKR ${creditLimit.toLocaleString()}. Ask your manager to approve this sale.`,
            }
          }
        }
      }
    }
  }

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
          schemeNotes: schemeNotes || null,
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

  logAudit({
    companyId,
    userId: user.id,
    userName: user.name ?? "",
    action: "CREATE_INVOICE",
    entityId: invoiceId,
    detail: `Invoice created`,
  })

  revalidatePath("/sales")
  revalidatePath("/inventory")
  revalidatePath("/alerts")
  redirect(`/sales/${invoiceId}`)
}

export async function updateInvoice(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const role = user.role as string
  const companyId = user.companyId as string
  const id = (formData.get("id") as string)?.trim()
  const customerId = (formData.get("customerId") as string) || null
  const invoiceDate = (formData.get("invoiceDate") as string) || new Date().toISOString()
  const dueDate = (formData.get("dueDate") as string) || null
  const paymentModeRaw = (formData.get("paymentMode") as string) || "CASH"
  const paidAmount = Math.max(0, parseFloat(formData.get("paidAmount") as string) || 0)
  const discountAmount = Math.max(0, parseFloat(formData.get("discountAmount") as string) || 0)
  const notes = (formData.get("notes") as string) || null
  const linesJson = formData.get("linesJson") as string
  if (!id) return { error: "Invoice ID missing" }
  if (!VALID_PAYMENT_MODES.includes(paymentModeRaw as any)) return { error: "Invalid payment mode" }
  let lines: LineInput[]
  try { lines = JSON.parse(linesJson) } catch { return { error: "Invalid line data" } }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one line item" }
  try {
    await db.$transaction(async (tx) => {
      const invoice = await tx.saleInvoice.findFirst({ where: { id, companyId }, include: { items: true, payments: true, returns: true } })
      if (!invoice) throw new Error("Invoice not found")
      const hasPosted = invoice.payments.length > 0 || invoice.returns.length > 0 || Number(invoice.paidAmount) > 0
      if (hasPosted && role !== "OWNER" && role !== "ADMIN") throw new Error("Only managers can edit invoices after payment or return activity")
      if (invoice.returns.length > 0) throw new Error("Cannot edit invoices after returns")
      for (const item of invoice.items) await tx.productBatch.update({ where: { id: item.batchId }, data: { quantity: { increment: item.quantity } } })
      await tx.stockMovement.deleteMany({ where: { reference: invoice.invoiceNumber } })
      await tx.saleInvoiceItem.deleteMany({ where: { invoiceId: id } })
      let totalAmount = 0, taxAmount = 0
      for (const line of lines) { const base = line.quantity * line.salePrice * (1 - line.discount / 100); totalAmount += base; taxAmount += base * line.taxRate / 100 }
      const netAmount = Math.max(0, totalAmount - discountAmount + taxAmount)
      await tx.saleInvoice.update({ where: { id }, data: { customerId, invoiceDate: new Date(invoiceDate), dueDate: dueDate ? new Date(dueDate) : null, totalAmount, discountAmount, taxAmount, netAmount, paidAmount: Math.min(paidAmount, netAmount + 0.001), paymentMode: paymentModeRaw as PaymentMode, isCashSale: !customerId, notes } })
      for (const line of lines) {
        const batch = await tx.productBatch.findFirst({ where: { id: line.batchId, companyId, productId: line.productId } })
        if (!batch) throw new Error("Batch not found")
        if (batch.quantity < line.quantity) throw new Error(`Insufficient stock: ${batch.quantity} available`)
        await tx.productBatch.update({ where: { id: line.batchId }, data: { quantity: { decrement: line.quantity } } })
        await tx.saleInvoiceItem.create({ data: { invoiceId: id, productId: line.productId, batchId: line.batchId, quantity: line.quantity, salePrice: line.salePrice, discount: line.discount, taxRate: line.taxRate, totalAmount: line.quantity * line.salePrice * (1 - line.discount / 100) } })
        await tx.stockMovement.create({ data: { companyId, productId: line.productId, batchId: line.batchId, type: MovementType.SALE, quantity: -line.quantity, reference: invoice.invoiceNumber, notes: `Sale ${invoice.invoiceNumber} edited` } })
      }
    })
  } catch (e: any) { return { error: e?.message ?? "Failed to update invoice" } }
  logAudit({ companyId, userId: user.id, userName: user.name ?? "", action: "UPDATE_INVOICE", entityId: id, detail: "Invoice updated" })
  revalidatePath("/sales"); revalidatePath("/inventory"); revalidatePath(`/sales/${id}`); redirect(`/sales/${id}`)
}

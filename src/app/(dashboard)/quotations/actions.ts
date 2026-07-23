"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { QuotationStatus } from "@prisma/client"

type ActionState = { error: string } | null

type LineInput = {
  productId: string
  quantity: number
  unit: string
  salePrice: number
  discount: number
  taxRate: number
}

export async function createQuotation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const userId = user.id as string

  const customerId = (formData.get("customerId") as string) || null
  const quoteDate = (formData.get("quoteDate") as string) || new Date().toISOString()
  const validUntil = (formData.get("validUntil") as string) || null
  const discountAmount = Math.max(0, parseFloat(formData.get("discountAmount") as string) || 0)
  const notes = (formData.get("notes") as string) || null
  const linesJson = formData.get("linesJson") as string

  if (!linesJson) return { error: "No items provided" }
  let lines: LineInput[]
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: "Invalid items data" }
  }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one item" }

  let quoteId = ""

  try {
    await db.$transaction(async (tx) => {
      const count = await tx.quotation.count({ where: { companyId } })
      const year = new Date().getFullYear()
      const quoteNumber = `QT-${year}-${String(count + 1).padStart(5, "0")}`

      let totalAmount = 0
      let taxAmount = 0
      for (const line of lines) {
        const base = line.quantity * line.salePrice * (1 - line.discount / 100)
        totalAmount += base
        taxAmount += base * line.taxRate / 100
      }
      const netAmount = Math.max(0, totalAmount - discountAmount + taxAmount)

      const quote = await tx.quotation.create({
        data: {
          companyId,
          userId,
          customerId: customerId || null,
          quoteNumber,
          quoteDate: new Date(quoteDate),
          validUntil: validUntil ? new Date(validUntil) : null,
          totalAmount,
          discountAmount,
          taxAmount,
          netAmount,
          notes,
          status: "DRAFT",
        },
      })

      quoteId = quote.id

      for (const line of lines) {
        const base = line.quantity * line.salePrice * (1 - line.discount / 100)
        const lineTotal = base
        await tx.quotationItem.create({
          data: {
            quotationId: quote.id,
            productId: line.productId,
            quantity: line.quantity,
            unit: line.unit,
            salePrice: line.salePrice,
            discount: line.discount,
            taxRate: line.taxRate,
            totalAmount: lineTotal,
          },
        })
      }
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to create quotation" }
  }

  revalidatePath("/quotations")
  redirect(`/quotations/${quoteId}`)
}

export async function updateQuotationStatus(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return

  const companyId = user.companyId as string
  const id = formData.get("id") as string
  const status = formData.get("status") as QuotationStatus

  const VALID = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const
  if (!VALID.includes(status as any)) return

  try {
    await db.quotation.update({
      where: { id, companyId },
      data: { status },
    })
  } catch {
    return
  }

  revalidatePath(`/quotations/${id}`)
  revalidatePath("/quotations")
}

export async function convertQuotationToInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const userId = user.id as string
  const quoteId = formData.get("quoteId") as string

  const quote = await db.quotation.findFirst({
    where: { id: quoteId, companyId },
    include: {
      items: { include: { product: { select: { name: true } } } },
    },
  })
  if (!quote) return { error: "Quotation not found" }

  // Redirect to new invoice pre-filled — store quote context in URL
  redirect(
    `/sales/new?fromQuote=${quoteId}&customerId=${quote.customerId ?? ""}`
  )
}

export async function deleteQuotation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const id = formData.get("id") as string

  try {
    await db.quotation.delete({ where: { id, companyId } })
  } catch {
    return { error: "Failed to delete quotation" }
  }

  revalidatePath("/quotations")
  redirect("/quotations")
}

export async function updateQuotation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const role = user.role as string
  if (role !== "OWNER" && role !== "ADMIN") return { error: "Access denied" }
  const companyId = user.companyId as string
  const id = formData.get("id") as string
  const customerId = (formData.get("customerId") as string) || null
  const quoteDate = (formData.get("quoteDate") as string) || new Date().toISOString()
  const validUntil = (formData.get("validUntil") as string) || null
  const discountAmount = Math.max(0, parseFloat(formData.get("discountAmount") as string) || 0)
  const notes = (formData.get("notes") as string) || null
  const linesJson = formData.get("linesJson") as string
  let lines: LineInput[]
  try { lines = JSON.parse(linesJson) } catch { return { error: "Invalid line data" } }
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Add at least one item" }
  try {
    await db.$transaction(async (tx) => {
      const quote = await tx.quotation.findFirst({ where: { id, companyId }, select: { status: true } })
      if (!quote) throw new Error("Quotation not found")
      if (quote.status === "ACCEPTED") throw new Error("Accepted quotations cannot be edited")
      let totalAmount = 0, taxAmount = 0
      for (const line of lines) { const base = line.quantity * line.salePrice * (1 - line.discount / 100); totalAmount += base; taxAmount += base * line.taxRate / 100 }
      const netAmount = Math.max(0, totalAmount - discountAmount + taxAmount)
      await tx.quotation.update({ where: { id }, data: { customerId, quoteDate: new Date(quoteDate), validUntil: validUntil ? new Date(validUntil) : null, totalAmount, discountAmount, taxAmount, netAmount, notes } })
      await tx.quotationItem.deleteMany({ where: { quotationId: id } })
      for (const line of lines) await tx.quotationItem.create({ data: { quotationId: id, productId: line.productId, quantity: line.quantity, unit: line.unit, salePrice: line.salePrice, discount: line.discount, taxRate: line.taxRate, totalAmount: line.quantity * line.salePrice * (1 - line.discount / 100) } })
    })
  } catch (e: any) { return { error: e?.message ?? "Failed to update quotation" } }
  revalidatePath("/quotations"); revalidatePath(`/quotations/${id}`); redirect(`/quotations/${id}`)
}

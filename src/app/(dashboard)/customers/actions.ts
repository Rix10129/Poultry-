"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { CustomerType, PaymentMode } from "@prisma/client"
import { writeAuditLog } from "@/lib/audit"

type ActionState = { error: string } | null

const VALID_TYPES = ["FARM", "VET_SHOP", "SUB_DEALER", "RETAIL"] as const
const VALID_PAYMENT_MODES = ["CASH", "BANK", "CHEQUE", "CREDIT"] as const

export async function createCustomer(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  const type = (formData.get("type") as string) || "RETAIL"
  if (!VALID_TYPES.includes(type as any)) return { error: "Invalid customer type" }

  const phone = (formData.get("phone") as string)?.trim() || null
  const email = (formData.get("email") as string)?.trim() || null
  const address = (formData.get("address") as string)?.trim() || null
  const area = (formData.get("area") as string)?.trim() || null
  const creditLimit = Math.max(0, parseFloat(formData.get("creditLimit") as string) || 0)
  const openingBalance = Math.max(0, parseFloat(formData.get("openingBalance") as string) || 0)

  let id = ""
  try {
    const c = await db.customer.create({
      data: {
        companyId,
        name,
        type: type as CustomerType,
        phone,
        email,
        address,
        area,
        creditLimit,
        openingBalance,
      },
    })
    id = c.id
  } catch {
    return { error: "Failed to create customer" }
  }

  revalidatePath("/customers")
  redirect(`/customers/${id}`)
}

export async function updateCustomer(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const id = (formData.get("id") as string)?.trim()
  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  const type = (formData.get("type") as string) || "RETAIL"
  if (!VALID_TYPES.includes(type as any)) return { error: "Invalid customer type" }

  const phone = (formData.get("phone") as string)?.trim() || null
  const email = (formData.get("email") as string)?.trim() || null
  const address = (formData.get("address") as string)?.trim() || null
  const area = (formData.get("area") as string)?.trim() || null
  const creditLimit = Math.max(0, parseFloat(formData.get("creditLimit") as string) || 0)

  try {
    const res = await db.customer.updateMany({
      where: { id, companyId },
      data: { name, type: type as CustomerType, phone, email, address, area, creditLimit },
    })
    if (!res.count) return { error: "Customer not found" }
  } catch {
    return { error: "Failed to update customer" }
  }

  revalidatePath("/customers")
  revalidatePath(`/customers/${id}`)
  redirect(`/customers/${id}`)
}

export async function deleteCustomer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const id = (formData.get("id") as string)?.trim()

  const [invoiceCount, paymentCount] = await Promise.all([
    db.saleInvoice.count({ where: { customerId: id, companyId } }),
    db.customerPayment.count({ where: { customerId: id, companyId } }),
  ])

  if (invoiceCount > 0 || paymentCount > 0)
    return {
      error: `Cannot delete — this customer has ${invoiceCount} invoice(s) on record. Deactivate instead.`,
    }

  try {
    await db.customer.deleteMany({ where: { id, companyId } })
  } catch {
    return { error: "Failed to delete customer" }
  }

  await writeAuditLog({
    companyId,
    userId: (user as any).id,
    action: "DELETE",
    entity: "Customer",
    entityId: id,
  })

  revalidatePath("/customers")
  redirect("/customers")
}

export async function recordPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const customerId = (formData.get("customerId") as string)?.trim()
  const invoiceId = (formData.get("invoiceId") as string)?.trim() || null
  const amount = parseFloat(formData.get("amount") as string) || 0
  const paymentModeRaw = (formData.get("paymentMode") as string) || "CASH"
  const paymentDate = (formData.get("paymentDate") as string) || new Date().toISOString()
  const reference = (formData.get("reference") as string)?.trim() || null
  const notes = (formData.get("notes") as string)?.trim() || null

  if (!customerId) return { error: "Customer is required" }
  if (amount <= 0) return { error: "Amount must be greater than 0" }
  if (!VALID_PAYMENT_MODES.includes(paymentModeRaw as any)) return { error: "Invalid payment mode" }

  const customer = await db.customer.findFirst({ where: { id: customerId, companyId } })
  if (!customer) return { error: "Customer not found" }

  try {
    await db.$transaction(async (tx) => {
      await tx.customerPayment.create({
        data: {
          companyId,
          customerId,
          invoiceId: invoiceId || null,
          amount,
          paymentMode: paymentModeRaw as PaymentMode,
          paymentDate: new Date(paymentDate),
          reference,
          notes,
        },
      })

      // Update the linked invoice's paidAmount
      if (invoiceId) {
        const invoice = await tx.saleInvoice.findFirst({
          where: { id: invoiceId, companyId },
          select: { netAmount: true, paidAmount: true },
        })
        if (invoice) {
          const newPaid = Math.min(
            parseFloat(invoice.netAmount.toString()),
            parseFloat(invoice.paidAmount.toString()) + amount
          )
          await tx.saleInvoice.update({ where: { id: invoiceId }, data: { paidAmount: newPaid } })
        }
      }
    })
  } catch (e: any) {
    return { error: e?.message ?? "Failed to record payment" }
  }

  revalidatePath(`/customers/${customerId}`)
  revalidatePath("/sales")
  if (invoiceId) revalidatePath(`/sales/${invoiceId}`)
  redirect(`/customers/${customerId}`)
}

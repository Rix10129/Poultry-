"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { CustomerType, PaymentMode } from "@prisma/client"
import { writeAuditLog } from "@/lib/audit"
import { postCustomerReceipt, reversePosting } from "@/lib/accounting/posting-service"
import { recordReversalAudit, requireReversalReason } from "@/lib/document-lifecycle"

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
  const openingBalanceRaw = formData.get("openingBalance")
  const canAdjustOpeningBalance = user.role === "OWNER" || user.role === "ADMIN"
  if (openingBalanceRaw !== null && !canAdjustOpeningBalance)
    return { error: "Only owners and admins can change opening balances" }

  const openingBalance = openingBalanceRaw === null ? null : Number(openingBalanceRaw)
  if (openingBalance !== null && (!Number.isFinite(openingBalance) || openingBalance < 0))
    return { error: "Opening balance must be a valid non-negative number" }

  let oldOpeningBalance = ""
  try {
    oldOpeningBalance = await db.$transaction(async (tx) => {
      const existing = await tx.customer.findFirst({
        where: { id, companyId },
        select: { openingBalance: true },
      })
      if (!existing) throw new Error("CUSTOMER_NOT_FOUND")

      await tx.customer.update({
        where: { id: id! },
        data: {
          name,
          type: type as CustomerType,
          phone,
          email,
          address,
          area,
          creditLimit,
          ...(openingBalance !== null ? { openingBalance } : {}),
        },
      })
      return existing.openingBalance.toString()
    })
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND")
      return { error: "Customer not found" }
    return { error: "Failed to update customer" }
  }

  const openingBalanceChanged =
    openingBalance !== null && Number(oldOpeningBalance) !== openingBalance
  if (openingBalanceChanged) {
    await writeAuditLog({
      companyId,
      userId: user.id,
      action: "UPDATE_OPENING_BALANCE",
      entity: "Customer",
      entityId: id,
      oldValues: { openingBalance: oldOpeningBalance },
      newValues: { openingBalance },
    })
  }

  revalidatePath("/customers")
  revalidatePath(`/customers/${id}`)
  revalidatePath(`/customers/${id}/statement`)
  if (openingBalanceChanged) {
    revalidatePath("/")
    revalidatePath("/reports/recovery")
    revalidatePath("/reports/balance-sheet")
    revalidatePath("/reports", "layout")
  }
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
      const payment = await tx.customerPayment.create({
        data: {
          status: "POSTED",
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
      await postCustomerReceipt(tx, { companyId, sourceId: payment.id, number: payment.id, date: payment.paymentDate, amount: payment.amount, paymentMode: payment.paymentMode, description: notes ?? "Customer receipt" })

      // Refresh the invoice cache from authoritative payment rows.
      if (invoiceId) {
        const invoice = await tx.saleInvoice.findFirst({
          where: { id: invoiceId, companyId },
          select: { id: true },
        })
        if (invoice) {
          const aggregate = await tx.customerPayment.aggregate({
            where: { invoiceId, companyId }, _sum: { amount: true },
          })
          const newPaid = Number(aggregate._sum.amount ?? 0)
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

export async function reverseCustomerPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getServerSession(authOptions); const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string; const id = String(formData.get("paymentId") || "")
  let reason: string; try { reason = requireReversalReason(formData.get("reason")) } catch (e) { return { error: (e as Error).message } }
  let customerId = ""; let invoiceId: string | null = null
  try { await db.$transaction(async tx => {
    const payment = await tx.customerPayment.findFirst({ where: { id, companyId } })
    if (!payment || payment.status !== "POSTED") throw new Error("Only a posted customer payment can be reversed")
    customerId = payment.customerId; invoiceId = payment.invoiceId
    const reversal = await reversePosting(tx, companyId, "CUSTOMER_RECEIPT", id, reason); if (!reversal) throw new Error("Customer payment accounting entry was not found")
    await tx.customerPayment.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversedBy: user.id, reversalReason: reason } })
    if (invoiceId) {
      const aggregate = await tx.customerPayment.aggregate({ where: { invoiceId, companyId, status: "POSTED" }, _sum: { amount: true } })
      await tx.saleInvoice.update({ where: { id: invoiceId }, data: { paidAmount: aggregate._sum.amount ?? 0 } })
    }
    await recordReversalAudit(tx, { companyId, userId: user.id, userName: user.name ?? "", entity: "CustomerPayment", originalDocumentId: id, reversalDocumentId: reversal.id, reason })
  }) } catch (e) { return { error: e instanceof Error ? e.message : "Failed to reverse customer payment" } }
  revalidatePath(`/customers/${customerId}`); if (invoiceId) revalidatePath(`/sales/${invoiceId}`); redirect(`/customers/${customerId}`)
}

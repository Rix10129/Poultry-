"use server"

import { db } from "@/lib/db"
import { getActiveSession } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { CustomerType, PaymentMode } from "@prisma/client"
import { writeAuditLog } from "@/lib/audit"
import { postCustomerReceipt, reversePosting } from "@/lib/accounting/posting-service"
import { recordReversalAudit, requireReversalReason } from "@/lib/document-lifecycle"
import { authorize, forbiddenAction, hasPermission } from "@/lib/authorization"
import { validateInvoicePayment } from "@/lib/customer-payment"

type ActionState = { error: string } | null

const VALID_TYPES = ["RETAILER", "WHOLESALER", "GARMENT_UNIT", "EXPORT_HOUSE"] as const
const VALID_PAYMENT_MODES = ["CASH", "BANK", "CHEQUE", "CREDIT"] as const

export async function createCustomer(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  const type = (formData.get("type") as string) || "RETAILER"
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

// A minimal, non-redirecting counterpart to createCustomer for the invoice
// form's "walk-in wants credit" flow — a genuinely new customer shouldn't
// force the operator to abandon an in-progress sale to fill out the full
// customer form elsewhere first. Defaults to RETAILER; the record can be
// reclassified and filled in later from the Customers page.
export async function quickCreateCustomer(name: string): Promise<{ id: string; name: string } | { error: string }> {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const trimmed = name.trim()
  if (!trimmed) return { error: "Name is required" }

  try {
    const existing = await db.customer.findFirst({
      where: { companyId, name: { equals: trimmed, mode: "insensitive" } },
      select: { id: true, name: true },
    })
    if (existing) return existing

    const c = await db.customer.create({ data: { companyId, name: trimmed, type: "RETAILER" } })
    revalidatePath("/customers")
    return { id: c.id, name: c.name }
  } catch {
    return { error: "Failed to create customer" }
  }
}

export async function updateCustomer(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const id = (formData.get("id") as string)?.trim()
  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  const type = (formData.get("type") as string) || "RETAILER"
  if (!VALID_TYPES.includes(type as any)) return { error: "Invalid customer type" }

  const phone = (formData.get("phone") as string)?.trim() || null
  const email = (formData.get("email") as string)?.trim() || null
  const address = (formData.get("address") as string)?.trim() || null
  const area = (formData.get("area") as string)?.trim() || null
  const creditLimit = Math.max(0, parseFloat(formData.get("creditLimit") as string) || 0)
  const openingBalanceRaw = formData.get("openingBalance")
  const canAdjustOpeningBalance = hasPermission(user.role, "OPENING_BALANCE_CORRECT")
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

// A dedicated, minimal counterpart to updateCustomer for guided
// opening-balance entry screens — touches only this one field instead of
// requiring every other customer field to be resupplied unchanged.
export async function updateCustomerOpeningBalance(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string
  if (!hasPermission(user.role, "OPENING_BALANCE_CORRECT"))
    return { error: "Only owners and admins can change opening balances" }

  const id = (formData.get("id") as string)?.trim()
  const openingBalance = Number(formData.get("openingBalance"))
  if (!id) return { error: "Customer is required" }
  if (!Number.isFinite(openingBalance) || openingBalance < 0)
    return { error: "Opening balance must be a valid non-negative number" }

  let oldOpeningBalance = ""
  try {
    oldOpeningBalance = await db.$transaction(async (tx) => {
      const existing = await tx.customer.findFirst({ where: { id, companyId }, select: { openingBalance: true } })
      if (!existing) throw new Error("CUSTOMER_NOT_FOUND")
      await tx.customer.update({ where: { id }, data: { openingBalance } })
      return existing.openingBalance.toString()
    })
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") return { error: "Customer not found" }
    return { error: "Failed to update opening balance" }
  }

  await writeAuditLog({
    companyId, userId: user.id, action: "UPDATE_OPENING_BALANCE", entity: "Customer", entityId: id,
    oldValues: { openingBalance: oldOpeningBalance }, newValues: { openingBalance },
  })

  revalidatePath("/customers")
  revalidatePath(`/customers/${id}`)
  revalidatePath(`/customers/${id}/statement`)
  revalidatePath("/")
  revalidatePath("/reports/recovery")
  revalidatePath("/reports/balance-sheet")
  revalidatePath("/reports", "layout")
  redirect(`/customers/${id}`)
}

export async function deleteCustomer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getActiveSession()
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
  const authorization = await authorize("PAYMENT_RECORD")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId

  const customerId = (formData.get("customerId") as string)?.trim()
  const invoiceId = (formData.get("invoiceId") as string)?.trim() || null
  const amount = parseFloat(formData.get("amount") as string) || 0
  const discountAmount = Math.max(0, parseFloat(formData.get("discountAmount") as string) || 0)
  const paymentModeRaw = (formData.get("paymentMode") as string) || "CASH"
  const paymentDate = (formData.get("paymentDate") as string) || new Date().toISOString()
  const reference = (formData.get("reference") as string)?.trim() || null
  const notes = (formData.get("notes") as string)?.trim() || null

  if (!customerId) return { error: "Customer is required" }
  if (amount < 0) return { error: "Amount cannot be negative" }
  if (amount + discountAmount <= 0) return { error: "Enter an amount received or a discount" }
  if (!VALID_PAYMENT_MODES.includes(paymentModeRaw as any)) return { error: "Invalid payment mode" }

  const customer = await db.customer.findFirst({ where: { id: customerId, companyId } })
  if (!customer) return { error: "Customer not found" }

  try {
    await db.$transaction(async (tx) => {
      let invoicePaidAmount: number | null = null
      if (invoiceId) {
        const invoice = await tx.saleInvoice.findFirst({
          where: { id: invoiceId, companyId },
          select: { id: true, companyId: true, customerId: true, netAmount: true, status: true },
        })
        const postedPayments = await tx.customerPayment.findMany({
          where: { invoiceId, companyId, status: "POSTED" }, select: { amount: true, discountAmount: true },
        })
        invoicePaidAmount = validateInvoicePayment({
          invoice, companyId, customerId, amount, discountAmount, postedPayments,
        }).newPaidAmount
      }

      const payment = await tx.customerPayment.create({
        data: {
          status: "POSTED",
          companyId,
          customerId,
          invoiceId: invoiceId || null,
          amount,
          discountAmount,
          paymentMode: paymentModeRaw as PaymentMode,
          paymentDate: new Date(paymentDate),
          reference,
          notes,
        },
      })
      await postCustomerReceipt(tx, { companyId, sourceId: payment.id, number: payment.id, date: payment.paymentDate, amount: payment.amount, discount: payment.discountAmount, paymentMode: payment.paymentMode, description: notes ?? "Customer receipt" })

      // Refresh the invoice cache from authoritative payment rows.
      if (invoiceId && invoicePaidAmount !== null)
        await tx.saleInvoice.update({ where: { id: invoiceId }, data: { paidAmount: invoicePaidAmount } })
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
  const authorization = await authorize("PAYMENT_CORRECT")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId as string; const id = String(formData.get("paymentId") || "")
  let reason: string; try { reason = requireReversalReason(formData.get("reason")) } catch (e) { return { error: (e as Error).message } }
  let customerId = ""; let invoiceId: string | null = null
  try { await db.$transaction(async tx => {
    const payment = await tx.customerPayment.findFirst({ where: { id, companyId } })
    if (!payment || payment.status !== "POSTED") throw new Error("Only a posted customer payment can be reversed")
    customerId = payment.customerId; invoiceId = payment.invoiceId
    // Payments recorded before the posting service went live have no
    // journal entry to reverse — nothing to undo in the books, but the
    // payment itself must still be voidable rather than stuck forever.
    const reversal = await reversePosting(tx, companyId, "CUSTOMER_RECEIPT", id, reason)
    await tx.customerPayment.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversedBy: user.id, reversalReason: reason } })
    if (invoiceId) {
      const aggregate = await tx.customerPayment.aggregate({ where: { invoiceId, companyId, status: "POSTED" }, _sum: { amount: true, discountAmount: true } })
      const remainingPaid = Number(aggregate._sum.amount ?? 0) + Number(aggregate._sum.discountAmount ?? 0)
      await tx.saleInvoice.update({ where: { id: invoiceId }, data: { paidAmount: remainingPaid } })
    }
    await recordReversalAudit(tx, { companyId, userId: user.id, userName: user.name ?? "", entity: "CustomerPayment", originalDocumentId: id, reversalDocumentId: reversal?.id ?? null, reason })
  }) } catch (e) { return { error: e instanceof Error ? e.message : "Failed to reverse customer payment" } }
  revalidatePath(`/customers/${customerId}`); if (invoiceId) revalidatePath(`/sales/${invoiceId}`); redirect(`/customers/${customerId}`)
}

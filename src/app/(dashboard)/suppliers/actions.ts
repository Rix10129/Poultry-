"use server"

import { db } from "@/lib/db"
import { getActiveSession } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { writeAuditLog } from "@/lib/audit"
import { PaymentMode } from "@prisma/client"
import { postSupplierPayment, reversePosting, currentActiveSourceType, repostSupplierPayment } from "@/lib/accounting/posting-service"
import { recordReversalAudit, requireReversalReason } from "@/lib/document-lifecycle"
import { authorize, forbiddenAction, hasPermission } from "@/lib/authorization"

type ActionState = { error: string } | null
const PAYMENT_MODES = ["CASH", "BANK", "CHEQUE"] as const

function refreshSupplierPaymentPaths(supplierId: string, purchaseOrderId?: string | null) {
  revalidatePath("/suppliers")
  revalidatePath(`/suppliers/${supplierId}`)
  revalidatePath("/purchases")
  revalidatePath("/reports/purchases")
  revalidatePath("/reports/balance-sheet")
  revalidatePath("/suppliers/schedule")
  revalidatePath("/api/export")
  if (purchaseOrderId) revalidatePath(`/purchases/${purchaseOrderId}`)
}

function paymentFields(formData: FormData) {
  const amount = Number(formData.get("amount"))
  const paymentMode = String(formData.get("paymentMode") || "CASH")
  const paymentDate = new Date(String(formData.get("paymentDate") || ""))
  return {
    amount, paymentMode, paymentDate,
    purchaseOrderId: String(formData.get("purchaseOrderId") || "").trim() || null,
    reference: String(formData.get("reference") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  }
}

export async function recordSupplierPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  const authorization = await authorize("PAYMENT_RECORD")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId
  const supplierId = String(formData.get("supplierId") || "").trim()
  const fields = paymentFields(formData)
  if (!supplierId) return { error: "Supplier is required" }
  if (!Number.isFinite(fields.amount) || fields.amount <= 0) return { error: "Amount must be greater than 0" }
  if (Number.isNaN(fields.paymentDate.getTime())) return { error: "A valid payment date is required" }
  if (!PAYMENT_MODES.includes(fields.paymentMode as any)) return { error: "Invalid payment mode" }

  const [supplier, purchase] = await Promise.all([
    db.supplier.findFirst({ where: { id: supplierId, companyId }, select: { id: true } }),
    fields.purchaseOrderId
      ? db.purchaseOrder.findFirst({ where: { id: fields.purchaseOrderId, supplierId, companyId }, select: { id: true } })
      : null,
  ])
  if (!supplier) return { error: "Supplier not found" }
  if (fields.purchaseOrderId && !purchase) return { error: "Purchase order does not belong to this supplier" }

  const payment = await db.$transaction(async tx => {
    const created = await tx.supplierPayment.create({ data: {
      status: "POSTED",
      companyId, supplierId, amount: fields.amount, paymentMode: fields.paymentMode as PaymentMode,
      paymentDate: fields.paymentDate, purchaseOrderId: fields.purchaseOrderId,
      reference: fields.reference, notes: fields.notes,
    } })
    await postSupplierPayment(tx, { companyId, sourceId: created.id, number: created.id, date: created.paymentDate, amount: created.amount, paymentMode: created.paymentMode })
    return created
  })
  await writeAuditLog({ companyId, userId: user.id, action: "CREATE_SUPPLIER_PAYMENT", entity: "SupplierPayment", entityId: payment.id, newValues: fields })
  refreshSupplierPaymentPaths(supplierId, fields.purchaseOrderId)
  redirect(`/suppliers/${supplierId}`)
}

export async function updateSupplierPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  if (user.role !== "OWNER" && user.role !== "ADMIN") return { error: "Only owners and admins can edit payments" }
  const companyId = user.companyId as string
  const id = String(formData.get("paymentId") || "").trim()
  const fields = paymentFields(formData)
  if (!Number.isFinite(fields.amount) || fields.amount <= 0) return { error: "Amount must be greater than 0" }
  if (Number.isNaN(fields.paymentDate.getTime())) return { error: "A valid payment date is required" }
  if (!PAYMENT_MODES.includes(fields.paymentMode as any)) return { error: "Invalid payment mode" }
  const existing = await db.supplierPayment.findFirst({ where: { id, companyId, isVoided: false } })
  if (!existing) return { error: "Active payment not found" }
  if (fields.purchaseOrderId) {
    const purchase = await db.purchaseOrder.findFirst({ where: { id: fields.purchaseOrderId, supplierId: existing.supplierId, companyId }, select: { id: true } })
    if (!purchase) return { error: "Purchase order does not belong to this supplier" }
  }
  const financialsChanged =
    Number(existing.amount) !== fields.amount ||
    existing.paymentMode !== fields.paymentMode ||
    existing.paymentDate.getTime() !== fields.paymentDate.getTime()

  await db.$transaction(async tx => {
    await tx.supplierPayment.update({ where: { id }, data: { ...fields, paymentMode: fields.paymentMode as PaymentMode } })
    // The ledger entry posted when this payment was recorded reflects the
    // OLD amount/mode/date — if those changed, it must be reversed and
    // reposted, or payables/cash balances would silently go stale.
    if (financialsChanged) {
      await repostSupplierPayment(tx, companyId, id, `Supplier payment edited — amount or mode corrected`, new Date(), {
        companyId, sourceId: id, number: id, date: fields.paymentDate, amount: fields.amount, paymentMode: fields.paymentMode as PaymentMode,
      })
    }
  })
  await writeAuditLog({ companyId, userId: user.id, action: "UPDATE_SUPPLIER_PAYMENT", entity: "SupplierPayment", entityId: id, oldValues: { amount: existing.amount.toString(), paymentMode: existing.paymentMode, paymentDate: existing.paymentDate, purchaseOrderId: existing.purchaseOrderId, reference: existing.reference, notes: existing.notes }, newValues: fields })
  refreshSupplierPaymentPaths(existing.supplierId, fields.purchaseOrderId || existing.purchaseOrderId)
  redirect(`/suppliers/${existing.supplierId}`)
}

export async function voidSupplierPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  if (user.role !== "OWNER" && user.role !== "ADMIN") return { error: "Only owners and admins can void payments" }
  const companyId = user.companyId as string
  const id = String(formData.get("paymentId") || "").trim()
  let reason: string
  try { reason = requireReversalReason(formData.get("reason")) } catch (error) { return { error: (error as Error).message } }
  const existing = await db.supplierPayment.findFirst({ where: { id, companyId, isVoided: false } })
  if (!existing) return { error: "Active payment not found" }
  await db.$transaction(async tx => {
    const activeSourceType = await currentActiveSourceType(tx, companyId, "SUPPLIER_PAYMENT", id)
    // Legacy supplier payments predating the posting service have no
    // journal entry to reverse — still allow the payment itself to be voided.
    const reversal = await reversePosting(tx, companyId, activeSourceType, id, reason)
    await tx.supplierPayment.update({ where: { id }, data: { isVoided: true, status: "REVERSED", voidedAt: new Date(), voidedBy: user.id, reversalReason: reason } })
    await recordReversalAudit(tx, { companyId, userId: user.id, userName: user.name ?? "", entity: "SupplierPayment", originalDocumentId: id, reversalDocumentId: reversal?.id ?? null, reason })
  })
  await writeAuditLog({ companyId, userId: user.id, action: "VOID_SUPPLIER_PAYMENT", entity: "SupplierPayment", entityId: id, oldValues: { isVoided: false, amount: existing.amount.toString() }, newValues: { isVoided: true } })
  refreshSupplierPaymentPaths(existing.supplierId, existing.purchaseOrderId)
  redirect(`/suppliers/${existing.supplierId}`)
}

export async function createSupplier(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  const phone = (formData.get("phone") as string)?.trim() || null
  const email = (formData.get("email") as string)?.trim() || null
  const address = (formData.get("address") as string)?.trim() || null
  const taxNumber = (formData.get("taxNumber") as string)?.trim() || null
  const openingBalance = Math.max(0, parseFloat(formData.get("openingBalance") as string) || 0)

  let id = ""
  try {
    const s = await db.supplier.create({
      data: { companyId, name, phone, email, address, taxNumber, openingBalance },
    })
    id = s.id
  } catch {
    return { error: "Failed to create supplier" }
  }

  revalidatePath("/suppliers")
  redirect(`/suppliers/${id}`)
}

export async function updateSupplier(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const id = (formData.get("id") as string)?.trim()
  const name = (formData.get("name") as string)?.trim()
  if (!name) return { error: "Name is required" }

  const phone = (formData.get("phone") as string)?.trim() || null
  const email = (formData.get("email") as string)?.trim() || null
  const address = (formData.get("address") as string)?.trim() || null
  const taxNumber = (formData.get("taxNumber") as string)?.trim() || null
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
      const existing = await tx.supplier.findFirst({
        where: { id, companyId },
        select: { openingBalance: true },
      })
      if (!existing) throw new Error("SUPPLIER_NOT_FOUND")

      await tx.supplier.update({
        where: { id: id! },
        data: {
          name,
          phone,
          email,
          address,
          taxNumber,
          ...(openingBalance !== null ? { openingBalance } : {}),
        },
      })
      return existing.openingBalance.toString()
    })
  } catch (error) {
    if (error instanceof Error && error.message === "SUPPLIER_NOT_FOUND")
      return { error: "Supplier not found" }
    return { error: "Failed to update supplier" }
  }

  const openingBalanceChanged =
    openingBalance !== null && Number(oldOpeningBalance) !== openingBalance
  if (openingBalanceChanged) {
    await writeAuditLog({
      companyId,
      userId: user.id,
      action: "UPDATE_OPENING_BALANCE",
      entity: "Supplier",
      entityId: id,
      oldValues: { openingBalance: oldOpeningBalance },
      newValues: { openingBalance },
    })
  }

  revalidatePath("/suppliers")
  revalidatePath(`/suppliers/${id}`)
  if (openingBalanceChanged) {
    revalidatePath(`/suppliers/${id}/statement`)
    revalidatePath("/")
    revalidatePath("/reports/recovery")
    revalidatePath("/reports/balance-sheet")
    revalidatePath("/reports", "layout")
  }
  redirect(`/suppliers/${id}`)
}

export async function deleteSupplier(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const session = await getActiveSession()
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const id = (formData.get("id") as string)?.trim()

  const [poCount, paymentCount] = await Promise.all([
    db.purchaseOrder.count({ where: { supplierId: id, companyId } }),
    db.supplierPayment.count({ where: { supplierId: id, companyId } }),
  ])

  if (poCount > 0 || paymentCount > 0)
    return {
      error: `Cannot delete — this supplier has ${poCount} purchase order(s) on record. Remove their data first.`,
    }

  try {
    await db.supplier.deleteMany({ where: { id, companyId } })
  } catch {
    return { error: "Failed to delete supplier" }
  }

  revalidatePath("/suppliers")
  redirect("/suppliers")
}

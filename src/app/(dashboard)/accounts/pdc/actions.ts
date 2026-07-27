"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { PDCType } from "@prisma/client"
import { authorize, forbiddenAction } from "@/lib/authorization"
import { createPDCCheque, depositPDCCheque, bouncePDCCheque } from "@/lib/pdc-service"

type ActionState = { error: string } | null

const VALID_TYPES: PDCType[] = ["RECEIVABLE", "PAYABLE"]

export async function createPDC(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const authorization = await authorize("PAYMENT_RECORD")
  if (!authorization.ok) return forbiddenAction
  const companyId = authorization.actor.companyId

  const type = (formData.get("type") as string) as PDCType
  if (!VALID_TYPES.includes(type)) return { error: "Invalid type" }

  const chequeDateStr = formData.get("chequeDate") as string
  if (!chequeDateStr) return { error: "Cheque date is required" }

  let id = ""
  try {
    const result = await createPDCCheque(companyId, {
      type,
      customerId: (formData.get("customerId") as string) || null,
      supplierId: (formData.get("supplierId") as string) || null,
      chequeNumber: (formData.get("chequeNumber") as string)?.trim(),
      bankName: (formData.get("bankName") as string)?.trim() || null,
      chequeDate: new Date(chequeDateStr),
      amount: parseFloat(formData.get("amount") as string),
      notes: (formData.get("notes") as string)?.trim() || null,
    })
    id = result.id
  } catch (e: any) {
    return { error: e?.message ?? "Failed to create cheque record" }
  }

  revalidatePath("/accounts/pdc")
  redirect(`/accounts/pdc/${id}`)
}

export async function depositPDC(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const authorization = await authorize("PAYMENT_RECORD")
  if (!authorization.ok) return forbiddenAction
  const companyId = authorization.actor.companyId
  const id = (formData.get("id") as string)?.trim()

  try {
    await depositPDCCheque(companyId, id)
  } catch (e: any) {
    return { error: e?.message ?? "Failed to mark cheque deposited" }
  }

  revalidatePath("/accounts/pdc")
  revalidatePath(`/accounts/pdc/${id}`)
  redirect(`/accounts/pdc/${id}`)
}

export async function bouncePDC(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const authorization = await authorize("PAYMENT_CORRECT")
  if (!authorization.ok) return forbiddenAction
  const user = authorization.actor
  const companyId = user.companyId
  const id = (formData.get("id") as string)?.trim()

  try {
    await bouncePDCCheque(companyId, id, user, formData.get("reason"))
  } catch (e: any) {
    return { error: e?.message ?? "Failed to mark cheque bounced" }
  }

  revalidatePath("/accounts/pdc")
  revalidatePath(`/accounts/pdc/${id}`)
  redirect(`/accounts/pdc/${id}`)
}

export async function deletePDC(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const authorization = await authorize("PAYMENT_RECORD")
  if (!authorization.ok) return forbiddenAction
  const companyId = authorization.actor.companyId
  const id = (formData.get("id") as string)?.trim()

  try {
    const cheque = await db.pDCCheque.findFirst({ where: { id, companyId } })
    if (!cheque) return { error: "Cheque not found" }
    if (cheque.customerPaymentId || cheque.supplierPaymentId)
      return { error: "This cheque has posted accounting entries — mark it Bounced to reverse it instead of deleting" }

    await db.pDCCheque.deleteMany({ where: { id, companyId } })
  } catch {
    return { error: "Failed to delete cheque" }
  }

  revalidatePath("/accounts/pdc")
  redirect("/accounts/pdc")
}

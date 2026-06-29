"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { PDCType, PDCStatus } from "@prisma/client"

type ActionState = { error: string } | null

const VALID_TYPES: PDCType[] = ["RECEIVABLE", "PAYABLE"]

export async function createPDC(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const type = (formData.get("type") as string) as PDCType
  if (!VALID_TYPES.includes(type)) return { error: "Invalid type" }

  const customerId = (formData.get("customerId") as string) || null
  const supplierId = (formData.get("supplierId") as string) || null
  const chequeNumber = (formData.get("chequeNumber") as string)?.trim()
  const bankName = (formData.get("bankName") as string)?.trim() || null
  const chequeDateStr = formData.get("chequeDate") as string
  const amount = parseFloat(formData.get("amount") as string)
  const notes = (formData.get("notes") as string)?.trim() || null

  if (!chequeNumber) return { error: "Cheque number is required" }
  if (!chequeDateStr) return { error: "Cheque date is required" }
  if (!amount || amount <= 0) return { error: "Amount must be greater than 0" }
  if (type === "RECEIVABLE" && !customerId) return { error: "Customer is required for receivable cheques" }
  if (type === "PAYABLE" && !supplierId) return { error: "Supplier is required for payable cheques" }

  let id = ""
  try {
    const pdc = await db.pDCCheque.create({
      data: {
        companyId,
        type,
        customerId: type === "RECEIVABLE" ? customerId : null,
        supplierId: type === "PAYABLE" ? supplierId : null,
        chequeNumber,
        bankName,
        chequeDate: new Date(chequeDateStr),
        amount,
        notes,
      },
    })
    id = pdc.id
  } catch {
    return { error: "Failed to create cheque record" }
  }

  revalidatePath("/accounts/pdc")
  redirect(`/accounts/pdc/${id}`)
}

export async function updatePDCStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const id = (formData.get("id") as string)?.trim()
  const status = (formData.get("status") as string) as PDCStatus

  if (!["PENDING", "DEPOSITED", "BOUNCED"].includes(status)) return { error: "Invalid status" }

  try {
    const res = await db.pDCCheque.updateMany({
      where: { id, companyId },
      data: {
        status,
        depositedAt: status === "DEPOSITED" ? new Date() : null,
      },
    })
    if (!res.count) return { error: "Cheque not found" }
  } catch {
    return { error: "Failed to update status" }
  }

  revalidatePath("/accounts/pdc")
  revalidatePath(`/accounts/pdc/${id}`)
  redirect(`/accounts/pdc/${id}`)
}

export async function deletePDC(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }
  const companyId = user.companyId as string

  const id = (formData.get("id") as string)?.trim()

  try {
    await db.pDCCheque.deleteMany({ where: { id, companyId } })
  } catch {
    return { error: "Failed to delete cheque" }
  }

  revalidatePath("/accounts/pdc")
  redirect("/accounts/pdc")
}

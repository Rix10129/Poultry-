"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"

type ActionState = { error: string } | null

export async function createPaymentSchedule(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const supplierId = formData.get("supplierId") as string
  const purchaseOrderId = (formData.get("purchaseOrderId") as string) || null
  const description = (formData.get("description") as string)?.trim()
  const dueDateStr = formData.get("dueDate") as string
  const amount = parseFloat(formData.get("amount") as string)
  const notes = (formData.get("notes") as string)?.trim() || null

  if (!supplierId) return { error: "Supplier is required" }
  if (!description) return { error: "Description is required" }
  if (!dueDateStr) return { error: "Due date is required" }
  if (isNaN(amount) || amount <= 0) return { error: "Amount must be greater than 0" }

  try {
    await db.supplierPaymentSchedule.create({
      data: {
        companyId,
        supplierId,
        purchaseOrderId,
        description,
        dueDate: new Date(dueDateStr),
        amount,
        notes,
      },
    })
  } catch {
    return { error: "Failed to create payment schedule" }
  }

  revalidatePath("/suppliers/schedule")
  return null
}

export async function markSchedulePaid(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const id = formData.get("id") as string

  try {
    await db.supplierPaymentSchedule.updateMany({
      where: { id, companyId },
      data: { isPaid: true, paidAt: new Date() },
    })
  } catch {
    return { error: "Failed to mark as paid" }
  }

  revalidatePath("/suppliers/schedule")
  return null
}

export async function deletePaymentSchedule(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const id = formData.get("id") as string

  try {
    await db.supplierPaymentSchedule.deleteMany({ where: { id, companyId } })
  } catch {
    return { error: "Failed to delete schedule" }
  }

  revalidatePath("/suppliers/schedule")
  return null
}

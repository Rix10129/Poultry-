"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

type ActionState = { error: string } | null

export async function createSupplier(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getServerSession(authOptions)
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
  const session = await getServerSession(authOptions)
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

  try {
    const count = await db.supplier.updateMany({
      where: { id, companyId },
      data: { name, phone, email, address, taxNumber },
    })
    if (!count.count) return { error: "Supplier not found" }
  } catch {
    return { error: "Failed to update supplier" }
  }

  revalidatePath("/suppliers")
  revalidatePath(`/suppliers/${id}`)
  redirect(`/suppliers/${id}`)
}

export async function deleteSupplier(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const session = await getServerSession(authOptions)
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

"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"

type ActionState = { error: string } | { success: string } | null

export async function updateCompany(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const actor = session?.user as any
  if (!actor?.companyId) return { error: "Not authenticated" }
  if (actor.role !== "OWNER") return { error: "Only the Owner can change company settings" }

  const name = (formData.get("name") as string)?.trim()
  const phone = (formData.get("phone") as string)?.trim() || null
  const email = (formData.get("email") as string)?.trim() || null
  const address = (formData.get("address") as string)?.trim() || null
  const taxNumber = (formData.get("taxNumber") as string)?.trim() || null
  const strnNumber = (formData.get("strnNumber") as string)?.trim() || null
  const currency = (formData.get("currency") as string)?.trim() || "PKR"
  const logoUrl = (formData.get("logoUrl") as string)?.trim() || null

  if (!name) return { error: "Company name is required" }

  await db.company.update({
    where: { id: actor.companyId },
    data: { name, phone, email, address, taxNumber, strnNumber, currency, logoUrl },
  })

  revalidatePath("/settings")
  revalidatePath("/")
  return { success: "Settings saved successfully." }
}

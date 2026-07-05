"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

type ActionState = { error: string } | null

export async function createRoute(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const name = (formData.get("name") as string)?.trim()
  const description = (formData.get("description") as string)?.trim() || null
  const salesmanId = (formData.get("salesmanId") as string) || null

  if (!name) return { error: "Route name is required" }

  let routeId = ""
  try {
    const route = await db.route.create({
      data: { companyId, name, description, salesmanId: salesmanId || null },
    })
    routeId = route.id
  } catch (e: any) {
    if (e?.code === "P2002") return { error: "A route with this name already exists" }
    return { error: "Failed to create route" }
  }

  revalidatePath("/routes")
  redirect(`/routes/${routeId}`)
}

export async function updateRoute(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const id = formData.get("id") as string
  const name = (formData.get("name") as string)?.trim()
  const description = (formData.get("description") as string)?.trim() || null
  const salesmanId = (formData.get("salesmanId") as string) || null

  if (!name) return { error: "Route name is required" }

  try {
    await db.route.update({
      where: { id, companyId },
      data: { name, description, salesmanId: salesmanId || null },
    })
  } catch (e: any) {
    if (e?.code === "P2002") return { error: "A route with this name already exists" }
    return { error: "Failed to update route" }
  }

  revalidatePath(`/routes/${id}`)
  revalidatePath("/routes")
  redirect(`/routes/${id}`)
}

export async function logVisit(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return

  const companyId = user.companyId as string
  const userId = user.id as string
  const routeId = formData.get("routeId") as string
  const notes = (formData.get("notes") as string)?.trim() || null

  try {
    await db.routeVisit.create({
      data: { companyId, routeId, userId, notes },
    })
  } catch {
    return
  }

  revalidatePath(`/routes/${routeId}`)
}

export async function assignCustomerToRoute(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return

  const companyId = user.companyId as string
  const customerId = formData.get("customerId") as string
  const routeId = (formData.get("routeId") as string) || null

  if (!customerId) return

  try {
    await db.customer.update({
      where: { id: customerId, companyId },
      data: { routeId: routeId || null },
    })
  } catch {
    return
  }

  revalidatePath("/routes")
  revalidatePath(`/customers/${customerId}`)
}

export async function deleteRoute(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.companyId) return { error: "Not authenticated" }

  const companyId = user.companyId as string
  const id = formData.get("id") as string

  try {
    // Unassign customers first
    await db.customer.updateMany({ where: { routeId: id, companyId }, data: { routeId: null } })
    await db.route.delete({ where: { id, companyId } })
  } catch {
    return { error: "Failed to delete route" }
  }

  revalidatePath("/routes")
  redirect("/routes")
}

"use server"

import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"

type ActionState = { error: string } | null
type PasswordState = { error: string } | { ok: true } | null

const ROLE_HIERARCHY: Record<string, UserRole[]> = {
  OWNER: ["OWNER", "ADMIN", "CASHIER", "SALESMAN"],
  ADMIN: ["CASHIER", "SALESMAN"],
}

function canManage(actorRole: string, targetRole: string): boolean {
  return (ROLE_HIERARCHY[actorRole] ?? []).includes(targetRole as UserRole)
}

function requireManager(actor: any): string | null {
  if (!actor?.companyId) return "Not authenticated"
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") return "Access denied"
  return null
}

export async function createUser(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const actor = session?.user as any
  const err = requireManager(actor)
  if (err) return { error: err }

  const name = (formData.get("name") as string)?.trim()
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  const role = (formData.get("role") as string) || "CASHIER"
  const phone = (formData.get("phone") as string)?.trim() || null
  const password = formData.get("password") as string

  if (!name) return { error: "Name is required" }
  if (!email) return { error: "Email is required" }
  if (!password || password.length < 6) return { error: "Password must be at least 6 characters" }
  if (!canManage(actor.role, role)) return { error: "You cannot assign this role" }

  const hashed = await bcrypt.hash(password, 12)

  let id = ""
  try {
    const u = await db.user.create({
      data: { companyId: actor.companyId, name, email, role: role as UserRole, phone, password: hashed },
    })
    id = u.id
  } catch (e: any) {
    if (e?.code === "P2002") return { error: "A user with this email already exists in your company" }
    return { error: "Failed to create user" }
  }

  revalidatePath("/users")
  redirect(`/users/${id}`)
}

export async function updateUser(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getServerSession(authOptions)
  const actor = session?.user as any
  const err = requireManager(actor)
  if (err) return { error: err }

  const id = formData.get("id") as string
  const name = (formData.get("name") as string)?.trim()
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  const role = (formData.get("role") as string) || "CASHIER"
  const phone = (formData.get("phone") as string)?.trim() || null

  if (!id) return { error: "User ID missing" }
  if (!name) return { error: "Name is required" }
  if (!email) return { error: "Email is required" }

  const target = await db.user.findFirst({ where: { id, companyId: actor.companyId } })
  if (!target) return { error: "User not found" }
  if (!canManage(actor.role, target.role)) return { error: "You do not have permission to edit this user" }
  if (!canManage(actor.role, role)) return { error: "You cannot assign this role" }

  try {
    await db.user.update({ where: { id }, data: { name, email, role: role as UserRole, phone } })
  } catch (e: any) {
    if (e?.code === "P2002") return { error: "A user with this email already exists in your company" }
    return { error: "Failed to update user" }
  }

  revalidatePath("/users")
  revalidatePath(`/users/${id}`)
  redirect(`/users/${id}`)
}

export async function changePassword(_: PasswordState, formData: FormData): Promise<PasswordState> {
  const session = await getServerSession(authOptions)
  const actor = session?.user as any
  const err = requireManager(actor)
  if (err) return { error: err }

  const id = formData.get("id") as string
  const newPassword = formData.get("newPassword") as string
  const confirm = formData.get("confirmPassword") as string

  if (!id) return { error: "User ID missing" }
  if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters" }
  if (newPassword !== confirm) return { error: "Passwords do not match" }

  const target = await db.user.findFirst({ where: { id, companyId: actor.companyId } })
  if (!target) return { error: "User not found" }
  if (!canManage(actor.role, target.role)) return { error: "You do not have permission to edit this user" }

  const hashed = await bcrypt.hash(newPassword, 12)
  await db.user.update({ where: { id }, data: { password: hashed } })

  revalidatePath(`/users/${id}`)
  return { ok: true }
}

export async function toggleActive(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const actor = session?.user as any
  if (!actor?.companyId || (actor.role !== "OWNER" && actor.role !== "ADMIN")) return

  const id = formData.get("id") as string
  if (!id || id === actor.id) return

  const target = await db.user.findFirst({ where: { id, companyId: actor.companyId } })
  if (!target || !canManage(actor.role, target.role)) return

  await db.user.update({ where: { id }, data: { isActive: !target.isActive } })
  revalidatePath("/users")
  revalidatePath(`/users/${id}`)
  redirect(`/users/${id}`)
}

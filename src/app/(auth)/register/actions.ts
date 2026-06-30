"use server"

import { db } from "@/lib/db"
import { UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { randomUUID } from "crypto"
import { sendVerificationEmail } from "@/lib/email"

const registerSchema = z
  .object({
    companyName: z.string().min(2, "Company name must be at least 2 characters").max(100),
    ownerName: z.string().min(2, "Your name must be at least 2 characters").max(100),
    email: z.string().email("Invalid email address").toLowerCase(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export type RegisterState = { error: string } | { success: true; email: string } | null

export async function registerCompany(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    companyName: formData.get("companyName"),
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Validation error" }
  }

  const { companyName, ownerName, email, password } = parsed.data

  const existing = await db.user.findFirst({ where: { email } })
  if (existing) return { error: "An account with this email already exists" }

  const hashed = await bcrypt.hash(password, 12)
  const verificationToken = randomUUID()

  try {
    await db.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: companyName.trim() } })
      await tx.user.create({
        data: {
          companyId: company.id,
          name: ownerName.trim(),
          email,
          password: hashed,
          role: UserRole.OWNER,
          emailVerified: false,
          verificationToken,
        },
      })
    })
  } catch {
    return { error: "Failed to create account. Please try again." }
  }

  try {
    await sendVerificationEmail(email, ownerName.trim(), verificationToken)
  } catch {
    // Don't block registration if email fails; user can request resend later
  }

  return { success: true, email }
}

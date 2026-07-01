"use server"

import { db } from "@/lib/db"
import { UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { randomUUID } from "crypto"
import { sendAdminApprovalRequest } from "@/lib/email"

const APP_URL = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")

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
  const approvalToken = randomUUID()

  try {
    await db.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName.trim(),
          status: "PENDING",
          approvalToken,
        },
      })
      await tx.user.create({
        data: {
          companyId: company.id,
          name: ownerName.trim(),
          email,
          password: hashed,
          role: UserRole.OWNER,
          emailVerified: true,
        },
      })
    })
  } catch {
    return { error: "Failed to create account. Please try again." }
  }

  // Notify admin to approve or reject
  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail) {
    await sendAdminApprovalRequest({
      to: adminEmail,
      companyName: companyName.trim(),
      ownerName: ownerName.trim(),
      ownerEmail: email,
      approveUrl: `${APP_URL}/api/admin/company/approve?token=${approvalToken}`,
      rejectUrl: `${APP_URL}/api/admin/company/reject?token=${approvalToken}`,
    }).catch((err) => {
      console.error("[register] Failed to send admin approval email:", {
        to: adminEmail,
        from: process.env.RESEND_FROM_EMAIL ?? "(not set)",
        apiKeySet: !!process.env.RESEND_API_KEY,
        apiKeyPrefix: process.env.RESEND_API_KEY?.slice(0, 8) ?? "(not set)",
        error: String(err),
      })
    })
  } else {
    console.warn("[register] ADMIN_EMAIL not set — approval email skipped")
  }

  return { success: true, email }
}

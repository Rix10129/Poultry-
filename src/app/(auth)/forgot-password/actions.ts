"use server"

import { db } from "@/lib/db"
import { randomUUID } from "crypto"
import { sendPasswordResetEmail } from "@/lib/email"

export type ForgotState = { error: string } | { success: true } | null

export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  if (!email) return { error: "Email address is required" }

  // Find all active users with this email (could be across multiple companies)
  const users = await db.user.findMany({
    where: { email, isActive: true },
    include: { company: { select: { name: true } } },
  })

  // Always return success to prevent email enumeration
  if (users.length > 0) {
    const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await Promise.all(
      users.map(async (user) => {
        const token = randomUUID()
        await db.user.update({
          where: { id: user.id },
          data: { passwordResetToken: token, passwordResetExpiry: expiry },
        })
        await sendPasswordResetEmail(user.email, user.name, token, user.company.name).catch(
          () => null
        )
      })
    )
  }

  return { success: true }
}

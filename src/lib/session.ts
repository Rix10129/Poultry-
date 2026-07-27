import { getServerSession, type Session } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

/**
 * Drop-in replacement for `getServerSession(authOptions)` that also enforces
 * single-session-per-user: if this token's activeSessionId has been
 * superseded by a newer login, the session is treated as absent so callers
 * that only check `session?.user` reject it the same way as a logged-out
 * request, instead of continuing to act on a revoked session.
 */
export async function getActiveSession(): Promise<Session | null> {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; activeSessionId?: string } | undefined
  if (!session || !user?.id || !user.activeSessionId) return session

  const dbUser = await db.user.findFirst({ where: { id: user.id }, select: { activeSessionId: true } })
  if (dbUser?.activeSessionId && dbUser.activeSessionId !== user.activeSessionId) return null

  return session
}

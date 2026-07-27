import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export const FORBIDDEN_MESSAGE = "Forbidden" as const
export const forbiddenAction = { error: FORBIDDEN_MESSAGE } as const

export type AppRole = "OWNER" | "ADMIN" | "ACCOUNTANT" | "SALESMAN" | "STOREKEEPER" | "CASHIER"
export type Permission =
  | "MASTER_CREATE" | "MASTER_EDIT" | "MASTER_DELETE"
  | "SALE_CREATE" | "SALE_EDIT" | "SALE_CANCEL"
  | "PURCHASE_CREATE" | "PURCHASE_EDIT" | "PURCHASE_CANCEL"
  | "PAYMENT_RECORD" | "PAYMENT_CORRECT"
  | "STOCK_ADJUST" | "ACCOUNTING_MANAGE" | "JOURNAL_POST"
  | "OPENING_BALANCE_CORRECT" | "EXPORT_DATA" | "BACKUP_RESTORE"
  | "APPROVE" | "PERIOD_CONTROL" | "USER_MANAGE" | "SETTINGS_MANAGE"

const all: Permission[] = ["MASTER_CREATE", "MASTER_EDIT", "MASTER_DELETE", "SALE_CREATE", "SALE_EDIT", "SALE_CANCEL", "PURCHASE_CREATE", "PURCHASE_EDIT", "PURCHASE_CANCEL", "PAYMENT_RECORD", "PAYMENT_CORRECT", "STOCK_ADJUST", "ACCOUNTING_MANAGE", "JOURNAL_POST", "OPENING_BALANCE_CORRECT", "EXPORT_DATA", "BACKUP_RESTORE", "APPROVE", "PERIOD_CONTROL", "USER_MANAGE", "SETTINGS_MANAGE"]

export const ROLE_PERMISSIONS: Readonly<Record<AppRole, readonly Permission[]>> = {
  OWNER: all,
  ADMIN: all.filter(permission => permission !== "SETTINGS_MANAGE"),
  ACCOUNTANT: ["MASTER_CREATE", "MASTER_EDIT", "SALE_CREATE", "SALE_EDIT", "SALE_CANCEL", "PURCHASE_CREATE", "PURCHASE_EDIT", "PURCHASE_CANCEL", "PAYMENT_RECORD", "PAYMENT_CORRECT", "ACCOUNTING_MANAGE", "JOURNAL_POST", "OPENING_BALANCE_CORRECT", "EXPORT_DATA", "PERIOD_CONTROL"],
  SALESMAN: ["MASTER_CREATE", "MASTER_EDIT", "SALE_CREATE", "SALE_EDIT", "PAYMENT_RECORD"],
  STOREKEEPER: ["MASTER_CREATE", "MASTER_EDIT", "PURCHASE_CREATE", "PURCHASE_EDIT", "STOCK_ADJUST"],
  CASHIER: ["SALE_CREATE", "PAYMENT_RECORD"],
}

type Actor = { id: string; companyId: string; role: AppRole; name?: string | null; activeSessionId?: string | null }
type SessionResolver = () => Promise<{ user?: unknown } | null>
let resolveSession: SessionResolver = () => getServerSession(authOptions) as ReturnType<SessionResolver>

/** Test seam used to invoke real server actions without a browser or UI. */
export function setAuthorizationSessionResolverForTests(resolver?: SessionResolver) {
  resolveSession = resolver ?? (() => getServerSession(authOptions) as ReturnType<SessionResolver>)
}

export function hasPermission(role: string | null | undefined, permission: Permission): role is AppRole {
  return !!role && role in ROLE_PERMISSIONS && ROLE_PERMISSIONS[role as AppRole].includes(permission)
}

/**
 * Rejects a session that has been superseded by a newer login elsewhere
 * (single-session-per-user). Only checked when the token carries a
 * activeSessionId — test session stubs that omit it skip the DB round-trip.
 */
async function isSessionStale(user: Partial<Actor>): Promise<boolean> {
  if (!user.id || !user.activeSessionId) return false
  const dbUser = await db.user.findFirst({ where: { id: user.id }, select: { activeSessionId: true } })
  return !!dbUser?.activeSessionId && dbUser.activeSessionId !== user.activeSessionId
}

export async function authorize(permission: Permission): Promise<{ ok: true; actor: Actor } | { ok: false; status: 401 | 403 }> {
  const session = await resolveSession()
  const user = session?.user as Partial<Actor> | undefined
  if (!user?.id || !user.companyId || !user.role) return { ok: false, status: 401 }
  if (await isSessionStale(user)) return { ok: false, status: 401 }
  if (!hasPermission(user.role, permission)) return { ok: false, status: 403 }
  return { ok: true, actor: user as Actor }
}

export function forbiddenResponse() {
  return NextResponse.json(forbiddenAction, { status: 403 })
}

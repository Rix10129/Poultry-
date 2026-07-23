import { db } from "@/lib/db"
import { headers } from "next/headers"

export type AuditAction =
  | "LOGIN"
  | "VIEW_CUSTOMERS"
  | "VIEW_CUSTOMER"
  | "VIEW_REPORT"
  | "CREATE_INVOICE"
  | "DELETE_INVOICE"
  | "CREATE_PURCHASE"
  | "CREATE_QUOTATION"
  | "DELETE_QUOTATION"
  | "CREATE_EXPENSE"
  | "DELETE_EXPENSE"

interface AuditParams {
  companyId: string
  userId: string
  userName: string
  action: AuditAction
  entity?: string
  entityId?: string
  detail?: string
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const headersList = await headers()
    const ip =
      headersList.get("x-forwarded-for")?.split(",")[0].trim() ??
      headersList.get("x-real-ip") ??
      null

    // Fire-and-forget — never let logging break the main request
    db.auditLog
      .create({
        data: {
          companyId: params.companyId,
          userId: params.userId,
          userName: params.userName,
          action: params.action,
          entity: params.entity ?? null,
          entityId: params.entityId ?? null,
          detail: params.detail ?? null,
          ipAddress: ip,
        },
      })
      .catch(() => null)
  } catch {
    // silently swallow — audit must never break the app
  }
}

// Kept for backwards compatibility — existing callers still compile
export async function writeAuditLog(params: {
  companyId: string
  userId: string
  action: string
  entity: string
  entityId: string
  ipAddress?: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
}): Promise<void> {
  try {
    db.auditLog
      .create({
        data: {
          companyId: params.companyId,
          userId: params.userId,
          userName: "",
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          detail:
            params.oldValues || params.newValues
              ? JSON.stringify({ oldValues: params.oldValues ?? null, newValues: params.newValues ?? null })
              : null,
          ipAddress: params.ipAddress ?? null,
        },
      })
      .catch(() => null)
  } catch {
    // never crash
  }
}

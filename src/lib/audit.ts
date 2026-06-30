import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"

interface AuditParams {
  companyId: string
  userId: string
  action: "CREATE" | "UPDATE" | "DELETE"
  entity: string
  entityId: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  ipAddress?: string
}

export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        ipAddress: params.ipAddress,
        oldValues: params.oldValues
          ? (params.oldValues as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        newValues: params.newValues
          ? (params.newValues as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    })
  } catch {
    // Never let audit logging crash the main action
  }
}

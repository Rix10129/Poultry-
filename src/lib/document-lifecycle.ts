import type { DocumentStatus, Prisma } from "@prisma/client"

export type ProtectedRelations = {
  stockMovements?: number
  payments?: number
  ledgerPostings?: number
  returns?: number
  journalEntries?: number
}

/** Only an untouched draft is disposable; posted records remain immutable evidence. */
export function assertDocumentCanBeDeleted(status: DocumentStatus, relations: ProtectedRelations = {}) {
  const dependencies = Object.values(relations).reduce((sum, count) => sum + (count ?? 0), 0)
  if (status !== "DRAFT" || dependencies > 0) {
    throw new Error("Posted or referenced documents cannot be deleted. Reverse the document instead.")
  }
}

export function requireReversalReason(value: FormDataEntryValue | null) {
  const reason = typeof value === "string" ? value.trim() : ""
  if (reason.length < 3) throw new Error("A reversal reason of at least 3 characters is required")
  return reason
}

type AuditTx = Pick<Prisma.TransactionClient, "auditLog">

export async function recordReversalAudit(
  tx: AuditTx,
  input: { companyId: string; userId: string; userName: string; entity: string; originalDocumentId: string; reversalDocumentId: string; reason: string },
) {
  return tx.auditLog.create({ data: {
    companyId: input.companyId,
    userId: input.userId,
    userName: input.userName,
    action: "REVERSE",
    entity: input.entity,
    entityId: input.originalDocumentId,
    reason: input.reason,
    originalDocumentId: input.originalDocumentId,
    reversalDocumentId: input.reversalDocumentId,
    detail: JSON.stringify({ reason: input.reason, originalDocumentId: input.originalDocumentId, reversalDocumentId: input.reversalDocumentId }),
  } })
}

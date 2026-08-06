import { Prisma } from "@prisma/client"

type Transaction = Prisma.TransactionClient

export const DOCUMENT_NUMBER_PREFIXES = {
  SALE_INVOICE: "INV",
  CASH_MEMO: "CM",
  PURCHASE_ORDER: "PO",
  SALE_RETURN: "SR",
  PURCHASE_RETURN: "PR",
  QUOTATION: "QT",
  CASH_RECEIPT: "CR",
  CASH_PAYMENT: "CP",
  BANK_RECEIPT: "BR",
  BANK_PAYMENT: "BP",
  JOURNAL: "JV",
  JOURNAL_ENTRY: "JE",
} as const

export type DocumentNumberType = keyof typeof DOCUMENT_NUMBER_PREFIXES

export function financialYear(date: Date): number {
  return date.getUTCFullYear()
}

/**
 * Atomically allocates a company/FY-scoped number. This must be called with the
 * same transaction client used to insert the document so a failed insert also
 * rolls the counter back (and concurrent callers serialize on the sequence row).
 */
export async function allocateDocumentNumber(
  tx: Transaction,
  companyId: string,
  documentType: DocumentNumberType,
  date: Date,
): Promise<string> {
  const year = financialYear(date)
  const rows = await tx.$queryRaw<Array<{ lastValue: number }>>(Prisma.sql`
    INSERT INTO "DocumentSequence"
      ("id", "companyId", "documentType", "financialYear", "lastValue", "createdAt", "updatedAt")
    VALUES
      (${crypto.randomUUID()}, ${companyId}, ${documentType}, ${year}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("companyId", "documentType", "financialYear")
    DO UPDATE SET
      "lastValue" = "DocumentSequence"."lastValue" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastValue"
  `)
  const value = Number(rows[0]?.lastValue)
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Failed to allocate document number")
  return `${DOCUMENT_NUMBER_PREFIXES[documentType]}-${year}-${String(value).padStart(5, "0")}`
}

CREATE TABLE "DocumentSequence" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "financialYear" INTEGER NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentSequence_lastValue_check" CHECK ("lastValue" > 0)
);

ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "DocumentSequence_companyId_documentType_financialYear_key"
  ON "DocumentSequence"("companyId", "documentType", "financialYear");

-- Explicit business-number scopes (some older databases predate these Prisma constraints).
CREATE UNIQUE INDEX IF NOT EXISTS "SaleInvoice_companyId_invoiceNumber_key" ON "SaleInvoice"("companyId", "invoiceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_companyId_poNumber_key" ON "PurchaseOrder"("companyId", "poNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "SaleReturn_companyId_returnNumber_key" ON "SaleReturn"("companyId", "returnNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseReturn_companyId_returnNumber_key" ON "PurchaseReturn"("companyId", "returnNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_companyId_quoteNumber_key" ON "Quotation"("companyId", "quoteNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_companyId_voucherNumber_key" ON "JournalEntry"("companyId", "voucherNumber");

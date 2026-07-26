CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED', 'REVERSED');

ALTER TABLE "StockMovement" ADD COLUMN "sourceType" TEXT, ADD COLUMN "sourceId" TEXT;
CREATE INDEX "StockMovement_companyId_sourceType_sourceId_idx" ON "StockMovement"("companyId", "sourceType", "sourceId");

ALTER TABLE "PurchaseOrder" ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN "reversedAt" TIMESTAMP(3), ADD COLUMN "reversedBy" TEXT, ADD COLUMN "reversalReason" TEXT;
ALTER TABLE "PurchaseReturn" ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN "reversedAt" TIMESTAMP(3), ADD COLUMN "reversedBy" TEXT, ADD COLUMN "reversalReason" TEXT;
ALTER TABLE "SaleInvoice" ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN "reversedAt" TIMESTAMP(3), ADD COLUMN "reversedBy" TEXT, ADD COLUMN "reversalReason" TEXT;
ALTER TABLE "SaleReturn" ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN "reversedAt" TIMESTAMP(3), ADD COLUMN "reversedBy" TEXT, ADD COLUMN "reversalReason" TEXT;
ALTER TABLE "CustomerPayment" ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN "reversedAt" TIMESTAMP(3), ADD COLUMN "reversedBy" TEXT, ADD COLUMN "reversalReason" TEXT;
ALTER TABLE "SupplierPayment" ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN "reversalReason" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN "reversedAt" TIMESTAMP(3), ADD COLUMN "reversedBy" TEXT, ADD COLUMN "reversalReason" TEXT;
ALTER TABLE "Expense" ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN "reversedAt" TIMESTAMP(3), ADD COLUMN "reversedBy" TEXT, ADD COLUMN "reversalReason" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "reason" TEXT, ADD COLUMN "originalDocumentId" TEXT, ADD COLUMN "reversalDocumentId" TEXT;

-- Existing operational rows already affected stock, cash, or ledgers and are posted evidence.
UPDATE "PurchaseOrder" SET "status" = 'POSTED';
UPDATE "PurchaseReturn" SET "status" = 'POSTED';
UPDATE "SaleInvoice" SET "status" = 'POSTED';
UPDATE "SaleReturn" SET "status" = 'POSTED';
UPDATE "CustomerPayment" SET "status" = 'POSTED';
UPDATE "SupplierPayment" SET "status" = CASE WHEN "isVoided" THEN 'REVERSED'::"DocumentStatus" ELSE 'POSTED'::"DocumentStatus" END;
UPDATE "JournalEntry" SET "status" = CASE WHEN "isReversal" THEN 'POSTED'::"DocumentStatus" ELSE 'POSTED'::"DocumentStatus" END;
UPDATE "Expense" SET "status" = 'POSTED';

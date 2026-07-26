-- Production database migration — apply Phase 2-4 schema changes
-- Paste this entire script into your Neon SQL editor and run it.
-- It is safe to run multiple times (idempotent).

-- ─── New enum types ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PDCType" AS ENUM ('RECEIVABLE', 'PAYABLE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PDCStatus" AS ENUM ('PENDING', 'DEPOSITED', 'BOUNCED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExpenseCategory" AS ENUM (
    'FUEL', 'VEHICLE', 'SALARY', 'RENT', 'UTILITIES',
    'OFFICE', 'MARKETING', 'BANK_CHARGES', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── New nullable columns ─────────────────────────────────────────────────────

ALTER TABLE "SaleInvoice" ADD COLUMN IF NOT EXISTS "schemeNotes" TEXT;
ALTER TABLE "Company"     ADD COLUMN IF NOT EXISTS "strnNumber"  TEXT;

-- ─── New table: PDCCheque ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PDCCheque" (
  "id"           TEXT          NOT NULL,
  "companyId"    TEXT          NOT NULL,
  "type"         "PDCType"     NOT NULL,
  "customerId"   TEXT,
  "supplierId"   TEXT,
  "chequeNumber" TEXT          NOT NULL,
  "bankName"     TEXT,
  "chequeDate"   TIMESTAMP(3)  NOT NULL,
  "amount"       DECIMAL(12,2) NOT NULL,
  "status"       "PDCStatus"   NOT NULL DEFAULT 'PENDING',
  "depositedAt"  TIMESTAMP(3),
  "notes"        TEXT,
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PDCCheque_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "PDCCheque" ADD CONSTRAINT "PDCCheque_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PDCCheque" ADD CONSTRAINT "PDCCheque_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PDCCheque" ADD CONSTRAINT "PDCCheque_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "PDCCheque_companyId_chequeDate_idx" ON "PDCCheque"("companyId", "chequeDate");
CREATE INDEX IF NOT EXISTS "PDCCheque_companyId_status_idx"     ON "PDCCheque"("companyId", "status");

-- ─── New table: SalesTarget ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SalesTarget" (
  "id"           TEXT          NOT NULL,
  "companyId"    TEXT          NOT NULL,
  "userId"       TEXT          NOT NULL,
  "month"        INTEGER       NOT NULL,
  "year"         INTEGER       NOT NULL,
  "targetAmount" DECIMAL(12,2) NOT NULL,
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SalesTarget_companyId_userId_month_year_key"
  ON "SalesTarget"("companyId", "userId", "month", "year");
CREATE INDEX IF NOT EXISTS "SalesTarget_companyId_year_month_idx"
  ON "SalesTarget"("companyId", "year", "month");

-- ─── New table: Expense ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Expense" (
  "id"          TEXT              NOT NULL,
  "companyId"   TEXT              NOT NULL,
  "userId"      TEXT              NOT NULL,
  "category"    "ExpenseCategory" NOT NULL,
  "description" TEXT              NOT NULL,
  "amount"      DECIMAL(12,2)     NOT NULL,
  "expenseDate" TIMESTAMP(3)      NOT NULL,
  "paymentMode" "PaymentMode"     NOT NULL,
  "reference"   TEXT,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "Expense_companyId_expenseDate_idx" ON "Expense"("companyId", "expenseDate");
CREATE INDEX IF NOT EXISTS "Expense_companyId_category_idx"    ON "Expense"("companyId", "category");

-- ─── New table: FailedLogin (login rate limiting) ────────────────────────────

CREATE TABLE IF NOT EXISTS "FailedLogin" (
  "id"        TEXT         NOT NULL,
  "email"     TEXT         NOT NULL,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FailedLogin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FailedLogin_email_createdAt_idx" ON "FailedLogin"("email", "createdAt");

-- ─── User: email verification + password reset columns ───────────────────────

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified"       BOOLEAN      NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationToken"   TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken"  TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpiry" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_verificationToken_key"  ON "User"("verificationToken");
CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- ─── Company: approval workflow ───────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "CompanyStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "status"        "CompanyStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "approvalToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Company_approvalToken_key" ON "Company"("approvalToken");

-- ─── Phase 5: Routes, Quotations, Supplier Payment Schedules ─────────────────
-- Apply in Neon SQL editor. Safe to run multiple times (idempotent).

DO $$ BEGIN
  CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Route
CREATE TABLE IF NOT EXISTS "Route" (
  "id"          TEXT      NOT NULL,
  "companyId"   TEXT      NOT NULL,
  "salesmanId"  TEXT,
  "name"        TEXT      NOT NULL,
  "description" TEXT,
  "isActive"    BOOLEAN   NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Route_name_companyId_key" ON "Route"("name", "companyId");
CREATE INDEX IF NOT EXISTS "Route_companyId_idx" ON "Route"("companyId");
ALTER TABLE "Route" DROP CONSTRAINT IF EXISTS "Route_companyId_fkey";
ALTER TABLE "Route" ADD CONSTRAINT "Route_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Route" DROP CONSTRAINT IF EXISTS "Route_salesmanId_fkey";
ALTER TABLE "Route" ADD CONSTRAINT "Route_salesmanId_fkey" FOREIGN KEY ("salesmanId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RouteVisit
CREATE TABLE IF NOT EXISTS "RouteVisit" (
  "id"        TEXT      NOT NULL,
  "companyId" TEXT      NOT NULL,
  "routeId"   TEXT      NOT NULL,
  "userId"    TEXT      NOT NULL,
  "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouteVisit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RouteVisit_companyId_visitDate_idx" ON "RouteVisit"("companyId", "visitDate");
CREATE INDEX IF NOT EXISTS "RouteVisit_routeId_idx" ON "RouteVisit"("routeId");
ALTER TABLE "RouteVisit" DROP CONSTRAINT IF EXISTS "RouteVisit_companyId_fkey";
ALTER TABLE "RouteVisit" ADD CONSTRAINT "RouteVisit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouteVisit" DROP CONSTRAINT IF EXISTS "RouteVisit_routeId_fkey";
ALTER TABLE "RouteVisit" ADD CONSTRAINT "RouteVisit_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouteVisit" DROP CONSTRAINT IF EXISTS "RouteVisit_userId_fkey";
ALTER TABLE "RouteVisit" ADD CONSTRAINT "RouteVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Customer.routeId
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "routeId" TEXT;
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_routeId_fkey";
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Customer_routeId_idx" ON "Customer"("routeId");

-- Quotation
CREATE TABLE IF NOT EXISTS "Quotation" (
  "id"             TEXT             NOT NULL,
  "companyId"      TEXT             NOT NULL,
  "customerId"     TEXT,
  "userId"         TEXT             NOT NULL,
  "quoteNumber"    TEXT             NOT NULL,
  "quoteDate"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil"     TIMESTAMP(3),
  "status"         "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAmount"    DECIMAL(12,2)    NOT NULL,
  "discountAmount" DECIMAL(12,2)    NOT NULL DEFAULT 0,
  "taxAmount"      DECIMAL(12,2)    NOT NULL DEFAULT 0,
  "netAmount"      DECIMAL(12,2)    NOT NULL,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_quoteNumber_companyId_key" ON "Quotation"("quoteNumber", "companyId");
CREATE INDEX IF NOT EXISTS "Quotation_companyId_quoteDate_idx" ON "Quotation"("companyId", "quoteDate");
ALTER TABLE "Quotation" DROP CONSTRAINT IF EXISTS "Quotation_companyId_fkey";
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quotation" DROP CONSTRAINT IF EXISTS "Quotation_customerId_fkey";
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quotation" DROP CONSTRAINT IF EXISTS "Quotation_userId_fkey";
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- QuotationItem
CREATE TABLE IF NOT EXISTS "QuotationItem" (
  "id"          TEXT          NOT NULL,
  "quotationId" TEXT          NOT NULL,
  "productId"   TEXT          NOT NULL,
  "quantity"    INTEGER       NOT NULL,
  "unit"        TEXT          NOT NULL DEFAULT 'PIECE',
  "salePrice"   DECIMAL(12,2) NOT NULL,
  "discount"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxRate"     DECIMAL(5,2)  NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "QuotationItem" DROP CONSTRAINT IF EXISTS "QuotationItem_quotationId_fkey";
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationItem" DROP CONSTRAINT IF EXISTS "QuotationItem_productId_fkey";
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SupplierPaymentSchedule
CREATE TABLE IF NOT EXISTS "SupplierPaymentSchedule" (
  "id"              TEXT          NOT NULL,
  "companyId"       TEXT          NOT NULL,
  "supplierId"      TEXT          NOT NULL,
  "purchaseOrderId" TEXT,
  "description"     TEXT          NOT NULL,
  "dueDate"         TIMESTAMP(3)  NOT NULL,
  "amount"          DECIMAL(12,2) NOT NULL,
  "isPaid"          BOOLEAN       NOT NULL DEFAULT false,
  "paidAt"          TIMESTAMP(3),
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierPaymentSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupplierPaymentSchedule_companyId_dueDate_idx" ON "SupplierPaymentSchedule"("companyId", "dueDate");
CREATE INDEX IF NOT EXISTS "SupplierPaymentSchedule_supplierId_idx" ON "SupplierPaymentSchedule"("supplierId");
ALTER TABLE "SupplierPaymentSchedule" DROP CONSTRAINT IF EXISTS "SupplierPaymentSchedule_companyId_fkey";
ALTER TABLE "SupplierPaymentSchedule" ADD CONSTRAINT "SupplierPaymentSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentSchedule" DROP CONSTRAINT IF EXISTS "SupplierPaymentSchedule_supplierId_fkey";
ALTER TABLE "SupplierPaymentSchedule" ADD CONSTRAINT "SupplierPaymentSchedule_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPaymentSchedule" DROP CONSTRAINT IF EXISTS "SupplierPaymentSchedule_purchaseOrderId_fkey";
ALTER TABLE "SupplierPaymentSchedule" ADD CONSTRAINT "SupplierPaymentSchedule_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Phase 6: Audit Log + Single-Session Security ─────────────────────────────
-- Run this in Neon SQL Editor. Safe to run multiple times.

-- Single-session tracking column on User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeSessionId" TEXT;

-- Audit Log table (rebuild idempotently — extends/replaces any prior stub)
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"        TEXT          NOT NULL,
  "companyId" TEXT          NOT NULL,
  "userId"    TEXT          NOT NULL,
  "userName"  TEXT          NOT NULL,
  "action"    TEXT          NOT NULL,
  "entity"    TEXT,
  "entityId"  TEXT,
  "detail"    TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Add missing columns if the table existed before without them
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userName"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "detail"    TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entity"    TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entityId"  TEXT;

CREATE INDEX IF NOT EXISTS "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx"              ON "AuditLog"("userId");

ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_companyId_fkey";
ALTER TABLE "AuditLog" ADD  CONSTRAINT "AuditLog_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";
ALTER TABLE "AuditLog" ADD  CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CustomerPayment is the authoritative customer receipt ledger. Backfill the
-- legacy invoice-time portion that was previously stored only in paidAmount.
INSERT INTO "CustomerPayment" ("id", "companyId", "customerId", "invoiceId", "amount", "paymentMode", "paymentDate", "notes", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || i."id"), i."companyId", i."customerId", i."id",
       i."paidAmount" - COALESCE(p.paid, 0), i."paymentMode", i."invoiceDate",
       'Migrated invoice-time receipt', CURRENT_TIMESTAMP
FROM "SaleInvoice" i
LEFT JOIN (SELECT "invoiceId", SUM("amount") paid FROM "CustomerPayment" WHERE "invoiceId" IS NOT NULL GROUP BY "invoiceId") p
  ON p."invoiceId" = i."id"
WHERE i."customerId" IS NOT NULL AND i."paidAmount" > COALESCE(p.paid, 0);

UPDATE "SaleInvoice" i SET "paidAmount" = COALESCE(p.paid, 0)
FROM (SELECT i2."id", SUM(cp."amount") paid FROM "SaleInvoice" i2 LEFT JOIN "CustomerPayment" cp ON cp."invoiceId" = i2."id" GROUP BY i2."id") p
WHERE p."id" = i."id";
-- Idempotent, traceable accounting source references and immutable reversals.
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "postingKey" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "isReversal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "reversesEntryId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_postingKey_key" ON "JournalEntry"("postingKey");
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_reversesEntryId_key" ON "JournalEntry"("reversesEntryId");
CREATE INDEX IF NOT EXISTS "JournalEntry_companyId_sourceType_sourceId_idx" ON "JournalEntry"("companyId", "sourceType", "sourceId");

-- ─── Phase 8: Immutable document lifecycle and reversal audit ────────────────
DO $$ BEGIN CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED', 'REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "sourceType" TEXT, ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
CREATE INDEX IF NOT EXISTS "StockMovement_companyId_sourceType_sourceId_idx" ON "StockMovement"("companyId", "sourceType", "sourceId");
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "reversedBy" TEXT, ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;
ALTER TABLE "PurchaseReturn" ADD COLUMN IF NOT EXISTS "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "reversedBy" TEXT, ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;
ALTER TABLE "SaleInvoice" ADD COLUMN IF NOT EXISTS "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "reversedBy" TEXT, ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;
ALTER TABLE "SaleReturn" ADD COLUMN IF NOT EXISTS "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "reversedBy" TEXT, ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;
ALTER TABLE "CustomerPayment" ADD COLUMN IF NOT EXISTS "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "reversedBy" TEXT, ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;
ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "reversedBy" TEXT, ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "reversedBy" TEXT, ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "reason" TEXT, ADD COLUMN IF NOT EXISTS "originalDocumentId" TEXT, ADD COLUMN IF NOT EXISTS "reversalDocumentId" TEXT;
UPDATE "PurchaseOrder" SET "status"='POSTED' WHERE "status"='DRAFT'; UPDATE "PurchaseReturn" SET "status"='POSTED' WHERE "status"='DRAFT'; UPDATE "SaleInvoice" SET "status"='POSTED' WHERE "status"='DRAFT'; UPDATE "SaleReturn" SET "status"='POSTED' WHERE "status"='DRAFT'; UPDATE "CustomerPayment" SET "status"='POSTED' WHERE "status"='DRAFT'; UPDATE "SupplierPayment" SET "status"=CASE WHEN "isVoided" THEN 'REVERSED'::"DocumentStatus" ELSE 'POSTED'::"DocumentStatus" END WHERE "status"='DRAFT'; UPDATE "JournalEntry" SET "status"='POSTED' WHERE "status"='DRAFT'; UPDATE "Expense" SET "status"='POSTED' WHERE "status"='DRAFT';
CREATE TYPE "ImportStatus" AS ENUM ('COMMITTED', 'ROLLED_BACK');
CREATE TYPE "ImportRowStatus" AS ENUM ('CREATED', 'REUSED');

CREATE TABLE "InventoryImport" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "sourceFilename" TEXT NOT NULL, "checksum" TEXT NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'COMMITTED',
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rolledBackAt" TIMESTAMP(3), "rolledBackBy" TEXT, "rollbackReason" TEXT,
  CONSTRAINT "InventoryImport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryImportRow" (
  "id" TEXT NOT NULL, "importId" TEXT NOT NULL, "rowNumber" INTEGER NOT NULL,
  "status" "ImportRowStatus" NOT NULL, "supplierName" TEXT NOT NULL,
  "productName" TEXT NOT NULL, "batchNumber" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
  "purchasePrice" DECIMAL(12,2) NOT NULL, "salePrice" DECIMAL(12,2) NOT NULL,
  "result" JSONB NOT NULL, CONSTRAINT "InventoryImportRow_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryOpeningStock" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "importId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "batchId" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL, "totalValue" DECIMAL(14,2) NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'POSTED', "reversedAt" TIMESTAMP(3),
  "reversedBy" TEXT, "reversalReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryOpeningStock_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "InventoryImport" ADD CONSTRAINT "InventoryImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImport" ADD CONSTRAINT "InventoryImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImportRow" ADD CONSTRAINT "InventoryImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "InventoryImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryOpeningStock" ADD CONSTRAINT "InventoryOpeningStock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryOpeningStock" ADD CONSTRAINT "InventoryOpeningStock_importId_fkey" FOREIGN KEY ("importId") REFERENCES "InventoryImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InventoryImport_companyId_importedAt_idx" ON "InventoryImport"("companyId", "importedAt");
CREATE INDEX "InventoryImport_companyId_checksum_idx" ON "InventoryImport"("companyId", "checksum");
CREATE UNIQUE INDEX "InventoryImportRow_importId_rowNumber_key" ON "InventoryImportRow"("importId", "rowNumber");
CREATE INDEX "InventoryOpeningStock_companyId_importId_idx" ON "InventoryOpeningStock"("companyId", "importId");

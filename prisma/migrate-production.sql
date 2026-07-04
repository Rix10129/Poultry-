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

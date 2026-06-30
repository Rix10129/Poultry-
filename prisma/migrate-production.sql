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

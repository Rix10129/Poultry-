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

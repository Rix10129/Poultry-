-- AlterEnum
BEGIN;
CREATE TYPE "CustomerType_new" AS ENUM ('RETAILER', 'WHOLESALER', 'GARMENT_UNIT', 'EXPORT_HOUSE');
ALTER TABLE "public"."Customer" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Customer" ALTER COLUMN "type" TYPE "CustomerType_new" USING ("type"::text::"CustomerType_new");
ALTER TYPE "CustomerType" RENAME TO "CustomerType_old";
ALTER TYPE "CustomerType_new" RENAME TO "CustomerType";
DROP TYPE "public"."CustomerType_old";
ALTER TABLE "Customer" ALTER COLUMN "type" SET DEFAULT 'RETAILER';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UnitType_new" AS ENUM ('METER', 'YARD', 'THAAN', 'ROLL', 'KG', 'CONE', 'BAG', 'PIECE');
ALTER TABLE "public"."Product" ALTER COLUMN "unit" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "unit" TYPE "UnitType_new" USING ("unit"::text::"UnitType_new");
ALTER TABLE "Product" ALTER COLUMN "subUnit" TYPE "UnitType_new" USING ("subUnit"::text::"UnitType_new");
ALTER TYPE "UnitType" RENAME TO "UnitType_old";
ALTER TYPE "UnitType_new" RENAME TO "UnitType";
DROP TYPE "public"."UnitType_old";
ALTER TABLE "Product" ALTER COLUMN "unit" SET DEFAULT 'PIECE';
COMMIT;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "type" SET DEFAULT 'RETAILER';

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "species";

-- AlterTable
ALTER TABLE "ProductBatch" ALTER COLUMN "expiryDate" DROP NOT NULL;

-- DropEnum
DROP TYPE "Species";


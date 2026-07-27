-- AlterTable
ALTER TABLE "PDCCheque" ADD COLUMN     "bouncedAt" TIMESTAMP(3),
ADD COLUMN     "customerPaymentId" TEXT,
ADD COLUMN     "supplierPaymentId" TEXT;

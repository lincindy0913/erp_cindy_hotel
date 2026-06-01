-- AlterTable: add vendor rating and blacklist fields
ALTER TABLE "suppliers" ADD COLUMN "rating" INTEGER;
ALTER TABLE "suppliers" ADD COLUMN "is_blacklisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "suppliers" ADD COLUMN "blacklist_reason" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "blacklisted_at" TIMESTAMP(3);

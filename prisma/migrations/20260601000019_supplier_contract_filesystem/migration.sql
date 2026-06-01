-- AlterTable: make file_data nullable (existing BLOB records kept), add file_url for filesystem path
ALTER TABLE "supplier_contracts" ALTER COLUMN "file_data" DROP NOT NULL;
ALTER TABLE "supplier_contracts" ADD COLUMN "file_url" TEXT;

-- AddColumn: match_score to bank_recon_lines
ALTER TABLE "bank_recon_lines"
  ADD COLUMN "match_score" INTEGER NULL;

-- AddColumn: matched_by to bank_recon_lines
ALTER TABLE "bank_recon_lines"
  ADD COLUMN "matched_by" VARCHAR(100) NULL;

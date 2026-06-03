-- CreateTable: vat_filing_periods
-- 營業稅每兩個月申報期記錄（留抵稅額滾動追蹤）
CREATE TABLE "vat_filing_periods" (
    "id"               SERIAL NOT NULL,
    "year"             INTEGER NOT NULL,
    "period"           INTEGER NOT NULL,
    "warehouse"        VARCHAR(100),
    "period_start"     VARCHAR(20) NOT NULL,
    "period_end"       VARCHAR(20) NOT NULL,
    "output_tax"       DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "input_tax"        DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "carry_forward_in" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "tax_payable"      DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "carry_forward_out"DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "status"           VARCHAR(20) NOT NULL DEFAULT '草稿',
    "filed_by"         VARCHAR(255),
    "filed_at"         TIMESTAMP(3),
    "note"             TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_filing_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vat_filing_periods_year_period_warehouse_key"
    ON "vat_filing_periods"("year", "period", "warehouse");

CREATE INDEX "vat_filing_periods_year_period_idx"
    ON "vat_filing_periods"("year", "period");

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "product_type" VARCHAR(20) NOT NULL DEFAULT 'goods',
    "category" VARCHAR(100),
    "unit" VARCHAR(20),
    "cost_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sales_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_in_stock" BOOLEAN NOT NULL DEFAULT false,
    "low_stock_threshold" INTEGER,
    "warehouse_location" VARCHAR(50),
    "accounting_subject" VARCHAR(100),
    "inventory_subject" VARCHAR(100),
    "supplier_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "supplier_code" VARCHAR(50),
    "name" VARCHAR(255) NOT NULL,
    "tax_id" VARCHAR(50),
    "contact" VARCHAR(255),
    "person_in_charge" VARCHAR(255),
    "phone" VARCHAR(50),
    "address" VARCHAR(500),
    "email" VARCHAR(255),
    "payment_terms" VARCHAR(100),
    "bank_name" VARCHAR(100),
    "bank_account" VARCHAR(100),
    "contract_date" VARCHAR(20),
    "contract_end_date" VARCHAR(20),
    "payment_status" VARCHAR(20) DEFAULT '未付款',
    "remarks" TEXT,
    "check_payee" VARCHAR(255),
    "industry_category" VARCHAR(100),
    "sort_order" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20),
    "type" VARCHAR(20) NOT NULL DEFAULT 'storage',
    "parent_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_contracts" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" VARCHAR(100) NOT NULL,
    "file_data" BYTEA NOT NULL,
    "upload_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_masters" (
    "id" SERIAL NOT NULL,
    "purchase_no" VARCHAR(50) NOT NULL,
    "warehouse" VARCHAR(100),
    "department" VARCHAR(100),
    "supplier_id" INTEGER NOT NULL,
    "purchase_date" VARCHAR(20) NOT NULL,
    "payment_terms" VARCHAR(100),
    "tax_type" VARCHAR(20),
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT '待入庫',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_details" (
    "id" SERIAL NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT '待入庫',
    "inventory_warehouse" VARCHAR(100),

    CONSTRAINT "purchase_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_masters" (
    "id" SERIAL NOT NULL,
    "sales_no" VARCHAR(50) NOT NULL,
    "invoice_no" VARCHAR(50) NOT NULL,
    "invoice_date" VARCHAR(20) NOT NULL,
    "invoice_title" VARCHAR(255),
    "tax_type" VARCHAR(20),
    "invoice_amount" DECIMAL(12,2),
    "supplier_discount" DECIMAL(12,2) DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT '待核銷',
    "invoice_type" VARCHAR(20) NOT NULL DEFAULT '進貨單',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_details" (
    "id" SERIAL NOT NULL,
    "sales_id" INTEGER NOT NULL,
    "purchase_item_id" VARCHAR(50) NOT NULL,
    "purchase_id" INTEGER,
    "purchase_no" VARCHAR(50),
    "purchase_date" VARCHAR(20),
    "warehouse" VARCHAR(100),
    "supplier_id" INTEGER,
    "product_id" INTEGER,
    "quantity" INTEGER,
    "unit_price" DECIMAL(12,2),
    "note" TEXT,
    "subtotal" DECIMAL(12,2),

    CONSTRAINT "sales_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "payment_no" VARCHAR(50) NOT NULL,
    "invoice_ids" JSONB NOT NULL DEFAULT '[]',
    "payment_date" VARCHAR(20),
    "payment_method" VARCHAR(20) NOT NULL DEFAULT '月結',
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT '未完成',
    "check_issue_date" VARCHAR(20),
    "check_date" VARCHAR(20),
    "check_no" VARCHAR(50),
    "check_account" VARCHAR(100),
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "invoice_no" VARCHAR(50) NOT NULL,
    "invoice_date" VARCHAR(20),
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actual_payment_date" VARCHAR(20),
    "actual_payment_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT '未完成',
    "supplier_id" INTEGER,
    "supplier_name" VARCHAR(255),
    "warehouse" VARCHAR(100),
    "source_type" VARCHAR(50),
    "source_record_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "warehouse" VARCHAR(100),
    "purchase_master_id" INTEGER,
    "purchase_detail_id" INTEGER,
    "purchase_date" VARCHAR(20) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER,
    "tax_type" VARCHAR(20),
    "is_superseded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_comparisons" (
    "product_id" INTEGER NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "date" VARCHAR(20) NOT NULL,

    CONSTRAINT "price_comparisons_pkey" PRIMARY KEY ("product_id","supplier_id","date")
);

-- CreateTable
CREATE TABLE "price_summary_caches" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "latest_price" DECIMAL(12,2),
    "latest_date" VARCHAR(20),
    "lowest_price" DECIMAL(12,2),
    "lowest_date" VARCHAR(20),
    "avg_price_3m" DECIMAL(12,2),
    "avg_price_12m" DECIMAL(12,2),
    "purchase_count_12m" INTEGER,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_summary_caches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_expenses" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "department" VARCHAR(100) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" SERIAL NOT NULL,
    "account_code" VARCHAR(20),
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "warehouse" VARCHAR(100),
    "opening_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "current_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_confidential" BOOLEAN NOT NULL DEFAULT false,
    "auto_transaction_count" INTEGER,
    "last_auto_transaction_date" VARCHAR(20),
    "advance_owner_type" VARCHAR(20),
    "advance_owner_name" VARCHAR(100),
    "advance_owner_contact" VARCHAR(100),
    "repayment_alert_days" INTEGER,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "warehouse" VARCHAR(100),
    "accounting_subject_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system_default" BOOLEAN NOT NULL DEFAULT false,
    "system_code" VARCHAR(50),
    "level1" VARCHAR(20),
    "pl_group" VARCHAR(50),
    "pl_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" SERIAL NOT NULL,
    "transaction_no" VARCHAR(50) NOT NULL,
    "transaction_date" VARCHAR(20) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "warehouse" VARCHAR(100),
    "account_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "supplier_id" INTEGER,
    "payment_no" VARCHAR(50),
    "amount" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "has_fee" BOOLEAN NOT NULL DEFAULT false,
    "accounting_subject" VARCHAR(100),
    "invoice_no" VARCHAR(50),
    "invoice_amount" DECIMAL(12,2),
    "invoice_date" VARCHAR(20),
    "tax_type" VARCHAR(20),
    "tax_amount" DECIMAL(12,2),
    "payment_terms" VARCHAR(50),
    "description" VARCHAR(500),
    "transfer_account_id" INTEGER,
    "linked_transaction_id" INTEGER,
    "source_type" VARCHAR(50),
    "source_record_id" INTEGER,
    "is_auto_created" BOOLEAN NOT NULL DEFAULT false,
    "auto_creation_reason" VARCHAR(50),
    "linked_reconciliation_id" INTEGER,
    "linked_bank_statement_line_id" INTEGER,
    "linked_credit_card_statement_line_id" INTEGER,
    "is_non_cash_expense" BOOLEAN NOT NULL DEFAULT false,
    "created_by" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT '已確認',
    "is_reversal" BOOLEAN NOT NULL DEFAULT false,
    "reversal_of_id" INTEGER,
    "reversed_by_id" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_subjects" (
    "id" SERIAL NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "subcategory" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'user',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "warehouse_restriction" VARCHAR(100),
    "notification_settings" JSONB,
    "notification_email" VARCHAR(255),
    "line_user_id" VARCHAR(100),
    "line_display_name" VARCHAR(100),
    "line_linked_at" TIMESTAMP(3),
    "line_binding_token" VARCHAR(255),
    "line_binding_expired_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "password_history" JSONB NOT NULL DEFAULT '[]',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "totp_secret" VARCHAR(500),
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "totp_backup_codes" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_channels" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "notification_code" VARCHAR(10) NOT NULL,
    "enable_in_app" BOOLEAN NOT NULL DEFAULT true,
    "enable_email" BOOLEAN NOT NULL DEFAULT false,
    "enable_line" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "assigned_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "description" VARCHAR(500),
    "is_editable" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" VARCHAR(255),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_notification_configs" (
    "id" SERIAL NOT NULL,
    "smtp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "smtp_host" VARCHAR(255),
    "smtp_port" INTEGER,
    "smtp_user" VARCHAR(255),
    "smtp_password" VARCHAR(500),
    "smtp_use_tls" BOOLEAN NOT NULL DEFAULT true,
    "smtp_from_name" VARCHAR(100),
    "smtp_from_email" VARCHAR(255),
    "line_bot_enabled" BOOLEAN NOT NULL DEFAULT false,
    "line_bot_channel_id" VARCHAR(100),
    "line_bot_channel_secret" VARCHAR(500),
    "line_bot_access_token" VARCHAR(500),
    "line_bot_name" VARCHAR(100),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_notification_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_titles" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "tax_id" VARCHAR(50),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_method_options" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_method_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "category_type" VARCHAR(20) NOT NULL DEFAULT 'fixed',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_mapping_rules" (
    "id" SERIAL NOT NULL,
    "pms_column_name" VARCHAR(100) NOT NULL,
    "entry_type" VARCHAR(10) NOT NULL,
    "accounting_code" VARCHAR(20) NOT NULL,
    "accounting_name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_system_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_mapping_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_import_batches" (
    "id" SERIAL NOT NULL,
    "batch_no" VARCHAR(50) NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "business_date" VARCHAR(20) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT '已匯入',
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "credit_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "debit_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "room_count" INTEGER,
    "occupancy_rate" DECIMAL(5,2),
    "avg_room_rate" DECIMAL(12,2),
    "room_revenue" DECIMAL(12,2),
    "guest_count" INTEGER,
    "breakfast_count" INTEGER,
    "occupied_rooms" INTEGER,
    "monthly_credit_total" DECIMAL(12,2),
    "monthly_debit_total" DECIMAL(12,2),
    "imported_by" VARCHAR(255),
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by" VARCHAR(255),
    "verified_at" TIMESTAMP(3),
    "reservation_count" INTEGER DEFAULT 0,
    "has_reservation_rows" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pms_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_income_records" (
    "id" SERIAL NOT NULL,
    "import_batch_id" INTEGER,
    "warehouse" VARCHAR(100) NOT NULL,
    "business_date" VARCHAR(20) NOT NULL,
    "entry_type" VARCHAR(10) NOT NULL,
    "pms_column_name" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "accounting_code" VARCHAR(20),
    "accounting_name" VARCHAR(100),
    "is_modified" BOOLEAN NOT NULL DEFAULT false,
    "original_amount" DECIMAL(12,2),
    "note" VARCHAR(500),
    "cash_transaction_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_income_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_payment_method_configs" (
    "id" SERIAL NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL DEFAULT '',
    "pms_column_name" VARCHAR(100) NOT NULL,
    "cash_account_id" INTEGER,
    "settlement_delay_days" INTEGER NOT NULL DEFAULT 0,
    "fee_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "fee_accounting_code" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_payment_method_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_credit_card_fee_entries" (
    "id" SERIAL NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "settlement_date" VARCHAR(20) NOT NULL,
    "fee_amount" DECIMAL(12,2) NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_credit_card_fee_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_monthly_settlements" (
    "id" SERIAL NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "settlement_month" VARCHAR(7) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT '待核對',
    "credit_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "debit_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "batch_count" INTEGER NOT NULL DEFAULT 0,
    "verified_by" VARCHAR(255),
    "verified_at" TIMESTAMP(3),
    "settled_by" VARCHAR(255),
    "settled_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_monthly_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_agency_commission_configs" (
    "id" SERIAL NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "agency_code" VARCHAR(50),
    "commission_percentage" DECIMAL(5,2) NOT NULL,
    "payment_type" VARCHAR(10) NOT NULL,
    "data_source" VARCHAR(20) NOT NULL DEFAULT 'AUTO',
    "payment_due_day" INTEGER,
    "payment_method" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_agency_commission_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_manual_commission_entries" (
    "id" SERIAL NOT NULL,
    "settlement_month" VARCHAR(6) NOT NULL,
    "agency_name" VARCHAR(255) NOT NULL,
    "agency_code" VARCHAR(50),
    "total_room_rent" DECIMAL(12,2) NOT NULL,
    "room_nights" INTEGER NOT NULL,
    "commission_percentage" DECIMAL(5,2) NOT NULL,
    "commission_amount" DECIMAL(12,2) NOT NULL,
    "ar_or_ap" VARCHAR(10) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "remarks" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMP(3),
    "verified_by" INTEGER,
    "verified_at" TIMESTAMP(3),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_manual_commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_masters" (
    "id" SERIAL NOT NULL,
    "loan_code" VARCHAR(50) NOT NULL,
    "loan_name" VARCHAR(255) NOT NULL,
    "owner_type" VARCHAR(20) NOT NULL,
    "owner_name" VARCHAR(100),
    "warehouse" VARCHAR(100),
    "bank_name" VARCHAR(100) NOT NULL,
    "bank_branch" VARCHAR(100),
    "loan_type" VARCHAR(50) NOT NULL,
    "original_amount" DECIMAL(14,2) NOT NULL,
    "current_balance" DECIMAL(14,2) NOT NULL,
    "annual_rate" DECIMAL(6,4) NOT NULL,
    "rate_type" VARCHAR(20) NOT NULL,
    "repayment_type" VARCHAR(20) NOT NULL,
    "repayment_day" INTEGER NOT NULL,
    "start_date" VARCHAR(20) NOT NULL,
    "end_date" VARCHAR(20) NOT NULL,
    "deduct_account_id" INTEGER NOT NULL,
    "principal_subject_id" INTEGER,
    "interest_subject_id" INTEGER,
    "auto_debit" BOOLEAN NOT NULL DEFAULT true,
    "collateral" VARCHAR(500),
    "guarantor" VARCHAR(100),
    "guarantor_phone" VARCHAR(50),
    "guarantor_id_no" VARCHAR(20),
    "contact_person" VARCHAR(100),
    "contact_phone" VARCHAR(50),
    "remark" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT '使用中',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_rate_histories" (
    "id" SERIAL NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "annual_rate" DECIMAL(6,4) NOT NULL,
    "effective_date" VARCHAR(20) NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_rate_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_monthly_records" (
    "id" SERIAL NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "record_year" INTEGER NOT NULL,
    "record_month" INTEGER NOT NULL,
    "due_date" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT '暫估',
    "estimated_principal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimated_interest" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimated_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimated_at" TIMESTAMP(3),
    "estimated_by" VARCHAR(255),
    "actual_principal" DECIMAL(12,2),
    "actual_interest" DECIMAL(12,2),
    "actual_total" DECIMAL(12,2),
    "actual_debit_date" VARCHAR(20),
    "deduct_account_id" INTEGER,
    "statement_no" VARCHAR(100),
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" VARCHAR(255),
    "expense_id" INTEGER,
    "payment_order_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_monthly_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_notes" (
    "id" SERIAL NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checks" (
    "id" SERIAL NOT NULL,
    "check_no" VARCHAR(50) NOT NULL,
    "check_type" VARCHAR(20) NOT NULL,
    "check_number" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "issue_date" VARCHAR(20),
    "due_date" VARCHAR(20) NOT NULL,
    "clear_date" VARCHAR(20),
    "actual_amount" DECIMAL(12,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "drawer_type" VARCHAR(20) NOT NULL DEFAULT 'company',
    "drawer_name" VARCHAR(255),
    "source_account_id" INTEGER,
    "payee_name" VARCHAR(255),
    "supplier_id" INTEGER,
    "destination_account_id" INTEGER,
    "payment_id" INTEGER,
    "invoice_ids" JSONB,
    "batch_id" VARCHAR(50),
    "warehouse" VARCHAR(100),
    "accounting_subject_id" INTEGER,
    "bank_name" VARCHAR(100),
    "bank_branch" VARCHAR(100),
    "note" TEXT,
    "void_reason" TEXT,
    "bounced_reason" TEXT,
    "cash_transaction_id" INTEGER,
    "cleared_by" VARCHAR(255),
    "reissue_of_check_id" INTEGER,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "month_end_statuses" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "warehouse" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT '未結帳',
    "closed_by" VARCHAR(255),
    "closed_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "unlocked_by" VARCHAR(255),
    "unlocked_at" TIMESTAMP(3),
    "unlock_reason" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "month_end_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "month_end_reports" (
    "id" SERIAL NOT NULL,
    "month_end_id" INTEGER NOT NULL,
    "report_type" VARCHAR(50) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "warehouse" VARCHAR(100),
    "report_data" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "month_end_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_monthly_snapshots" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "snapshot_year" INTEGER NOT NULL,
    "snapshot_month" INTEGER NOT NULL,
    "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "closing_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "monthly_income" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "monthly_expense" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "last_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_monthly_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_monthly_snapshots" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "snapshot_year" INTEGER NOT NULL,
    "snapshot_month" INTEGER NOT NULL,
    "closing_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_purchase_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_consume_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closing_value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_monthly_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_aggregations" (
    "id" SERIAL NOT NULL,
    "aggregation_type" VARCHAR(50) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sub_breakdown" JSONB,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "is_finalized" BOOLEAN NOT NULL DEFAULT false,
    "warehouse" VARCHAR(100),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_aggregations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_monthly_caches" (
    "id" SERIAL NOT NULL,
    "property_id" INTEGER NOT NULL,
    "rental_contract_id" INTEGER,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "scheduled_rent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "collected_rent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "collection_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "maintenance_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_monthly_caches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_low_stock_caches" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "current_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "threshold" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "last_calculated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_low_stock_caches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_requisitions" (
    "id" SERIAL NOT NULL,
    "requisition_no" VARCHAR(50) NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "department" VARCHAR(100),
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "requisition_date" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT '已領用',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" SERIAL NOT NULL,
    "transfer_no" VARCHAR(50) NOT NULL,
    "from_warehouse" VARCHAR(100) NOT NULL,
    "to_warehouse" VARCHAR(100) NOT NULL,
    "transfer_date" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT '已調撥',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfer_items" (
    "id" SERIAL NOT NULL,
    "transfer_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "inventory_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" SERIAL NOT NULL,
    "count_no" VARCHAR(50) NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "count_date" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT '已確認',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_items" (
    "id" SERIAL NOT NULL,
    "count_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "system_qty" INTEGER NOT NULL,
    "actual_qty" INTEGER NOT NULL,
    "diff" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_monthly_summaries" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "total_purchase" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_invoice" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_paid" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "outstanding_ap" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "purchase_count" INTEGER NOT NULL DEFAULT 0,
    "warehouse" VARCHAR(100),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_monthly_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "notification_code" VARCHAR(20) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "target_url" VARCHAR(255),
    "required_permission" VARCHAR(50),
    "count" INTEGER NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2),
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_logs" (
    "id" SERIAL NOT NULL,
    "notification_code" VARCHAR(20) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "target_module" VARCHAR(50),
    "target_record_id" INTEGER,
    "target_record_no" VARCHAR(100),
    "before_state" JSONB,
    "after_state" JSONB,
    "note" TEXT,
    "user_id" INTEGER,
    "user_email" VARCHAR(255),
    "user_name" VARCHAR(100),
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" SERIAL NOT NULL,
    "source_module" VARCHAR(50) NOT NULL,
    "source_record_id" INTEGER NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" VARCHAR(100) NOT NULL,
    "file_data" BYTEA NOT NULL,
    "uploaded_by" VARCHAR(255),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_masters" (
    "id" SERIAL NOT NULL,
    "tenant_code" VARCHAR(50) NOT NULL,
    "tenant_type" VARCHAR(20) NOT NULL,
    "full_name" VARCHAR(255),
    "id_number" VARCHAR(50),
    "birth_date" VARCHAR(20),
    "company_name" VARCHAR(255),
    "tax_id" VARCHAR(50),
    "representative_name" VARCHAR(100),
    "phone" VARCHAR(50) NOT NULL,
    "phone2" VARCHAR(50),
    "email" VARCHAR(255),
    "address" VARCHAR(500),
    "emergency_contact" VARCHAR(100),
    "emergency_phone" VARCHAR(50),
    "bank_code" VARCHAR(10),
    "bank_branch" VARCHAR(100),
    "bank_account_name" VARCHAR(100),
    "bank_account_number" VARCHAR(50),
    "is_blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklist_reason" TEXT,
    "credit_note" TEXT,
    "note" TEXT,
    "lease_status" VARCHAR(20) DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_properties" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" VARCHAR(500),
    "building_name" VARCHAR(100),
    "unit_no" VARCHAR(50),
    "owner_name" VARCHAR(255),
    "house_tax_registration_no" VARCHAR(80),
    "rent_collect_account_id" INTEGER,
    "deposit_account_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'available',
    "note" TEXT,
    "public_interest_landlord" BOOLEAN NOT NULL DEFAULT false,
    "public_interest_applicant" VARCHAR(100),
    "public_interest_note" TEXT,
    "public_interest_start_date" VARCHAR(20),
    "public_interest_end_date" VARCHAR(20),
    "public_interest_rent" DECIMAL(12,2),
    "collect_utility_fee" BOOLEAN NOT NULL DEFAULT false,
    "category" VARCHAR(50),
    "sort_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "asset_type" VARCHAR(20) NOT NULL DEFAULT 'BUILDING',
    "address" VARCHAR(500),
    "area_sqm" DECIMAL(14,2),
    "acquisition_date" VARCHAR(20),
    "notes" TEXT,
    "serial_no" VARCHAR(50),
    "category" VARCHAR(100),
    "owner_name" VARCHAR(100),
    "registered_owner" VARCHAR(100),
    "house_tax_registration_no" VARCHAR(80),
    "sort_order" INTEGER,
    "is_available_for_rental" BOOLEAN NOT NULL DEFAULT false,
    "has_house_tax" BOOLEAN NOT NULL DEFAULT false,
    "has_land_tax" BOOLEAN NOT NULL DEFAULT false,
    "has_maintenance_fee" BOOLEAN NOT NULL DEFAULT false,
    "rental_property_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_disposals" (
    "id" SERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "disposal_date" VARCHAR(20) NOT NULL,
    "sale_price" DECIMAL(14,2),
    "stamp_tax" DECIMAL(12,2),
    "land_value_increment_tax" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_annual_rent_filings" (
    "id" SERIAL NOT NULL,
    "property_id" INTEGER NOT NULL,
    "contract_id" INTEGER,
    "slot_index" INTEGER NOT NULL DEFAULT 0,
    "filing_year" INTEGER NOT NULL,
    "is_public_interest" BOOLEAN NOT NULL DEFAULT false,
    "lessee_display_name" VARCHAR(255),
    "declared_monthly_rent" DECIMAL(12,2),
    "months_in_scope" INTEGER,
    "declared_annual_income" DECIMAL(14,2),
    "estimated_house_tax" DECIMAL(14,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_annual_rent_filings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_utility_incomes" (
    "id" SERIAL NOT NULL,
    "property_id" INTEGER NOT NULL,
    "income_year" INTEGER NOT NULL,
    "income_month" INTEGER NOT NULL,
    "expected_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actual_amount" DECIMAL(12,2),
    "actual_date" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "cash_transaction_id" INTEGER,
    "account_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_utility_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_bill_records" (
    "id" SERIAL NOT NULL,
    "warehouse" VARCHAR(50) NOT NULL,
    "bill_year" INTEGER NOT NULL,
    "bill_month" INTEGER NOT NULL,
    "bill_type" VARCHAR(20) NOT NULL,
    "summary_json" TEXT NOT NULL,
    "file_name" VARCHAR(255),
    "total_amount" DECIMAL(12,2),
    "payment_order_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utility_bill_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_contracts" (
    "id" SERIAL NOT NULL,
    "contract_no" VARCHAR(50) NOT NULL,
    "property_id" INTEGER NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "start_date" VARCHAR(20) NOT NULL,
    "end_date" VARCHAR(20) NOT NULL,
    "monthly_rent" DECIMAL(12,2) NOT NULL,
    "payment_due_day" INTEGER NOT NULL,
    "preferred_pay_method" VARCHAR(20),
    "deposit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit_account_id" INTEGER,
    "deposit_received" BOOLEAN NOT NULL DEFAULT false,
    "deposit_cash_transaction_id" INTEGER,
    "deposit_refunded" BOOLEAN NOT NULL DEFAULT false,
    "deposit_refund_cash_transaction_id" INTEGER,
    "deposit_refund_payment_order_id" INTEGER,
    "rent_account_id" INTEGER NOT NULL,
    "accounting_subject_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "renew_notify_days" INTEGER NOT NULL DEFAULT 60,
    "special_terms" TEXT,
    "note" TEXT,
    "previous_contract_id" INTEGER,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_reminders" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "sent_at" VARCHAR(20) NOT NULL,
    "sent_by" VARCHAR(255),
    "channel" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_year_locks" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL,
    "locked_by" VARCHAR(255),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_year_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_incomes" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "property_id" INTEGER NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "income_year" INTEGER NOT NULL,
    "income_month" INTEGER NOT NULL,
    "due_date" VARCHAR(20) NOT NULL,
    "expected_amount" DECIMAL(12,2) NOT NULL,
    "actual_date" VARCHAR(20),
    "actual_amount" DECIMAL(12,2),
    "account_id" INTEGER,
    "payment_method" VARCHAR(20),
    "match_transfer_ref" VARCHAR(100),
    "match_bank_account_name" VARCHAR(100),
    "match_note" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "cash_transaction_id" INTEGER,
    "note" TEXT,
    "confirmed_by" VARCHAR(255),
    "confirmed_at" TIMESTAMP(3),
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMP(3),
    "locked_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_income_payments" (
    "id" SERIAL NOT NULL,
    "rental_income_id" INTEGER NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" VARCHAR(20) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "payment_method" VARCHAR(20),
    "match_transfer_ref" VARCHAR(100),
    "match_bank_account_name" VARCHAR(100),
    "match_note" VARCHAR(500),
    "cash_transaction_id" INTEGER,
    "confirmed_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_income_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_taxes" (
    "id" SERIAL NOT NULL,
    "property_id" INTEGER NOT NULL,
    "tax_year" INTEGER NOT NULL,
    "tax_type" VARCHAR(20) NOT NULL,
    "due_date" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "payment_order_id" INTEGER,
    "cash_transaction_id" INTEGER,
    "confirmed_by" VARCHAR(255),
    "confirmed_at" TIMESTAMP(3),
    "paid_date" VARCHAR(20),
    "cert_no" VARCHAR(80),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_maintenances" (
    "id" SERIAL NOT NULL,
    "property_id" INTEGER NOT NULL,
    "maintenance_date" VARCHAR(20) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "accounting_subject_id" INTEGER,
    "supplier_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "cash_transaction_id" INTEGER,
    "payment_order_id" INTEGER,
    "is_employee_advance" BOOLEAN NOT NULL DEFAULT false,
    "advanced_by" VARCHAR(100),
    "advance_payment_method" VARCHAR(50),
    "employee_advance_id" INTEGER,
    "note" TEXT,
    "is_capitalized" BOOLEAN NOT NULL DEFAULT false,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_maintenances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_advances" (
    "id" SERIAL NOT NULL,
    "advance_no" VARCHAR(50) NOT NULL,
    "employee_name" VARCHAR(100) NOT NULL,
    "payment_method" VARCHAR(50) NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "source_record_id" INTEGER,
    "source_description" VARCHAR(500),
    "expense_name" VARCHAR(200),
    "summary" VARCHAR(500),
    "payment_order_id" INTEGER,
    "payment_order_no" VARCHAR(50),
    "amount" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT '待結算',
    "settled_amount" DECIMAL(12,2),
    "settled_date" VARCHAR(20),
    "settled_account_id" INTEGER,
    "settlement_tx_id" INTEGER,
    "settlement_tx_no" VARCHAR(50),
    "warehouse" VARCHAR(100),
    "note" TEXT,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_account_formats" (
    "id" SERIAL NOT NULL,
    "bank_name" VARCHAR(100) NOT NULL,
    "bank_code" VARCHAR(10),
    "file_encoding" VARCHAR(20) NOT NULL DEFAULT 'UTF-8',
    "file_type" VARCHAR(10) NOT NULL DEFAULT 'csv',
    "has_header_row" BOOLEAN NOT NULL DEFAULT true,
    "header_row_index" INTEGER NOT NULL DEFAULT 0,
    "skip_top_rows" INTEGER NOT NULL DEFAULT 0,
    "skip_bottom_rows" INTEGER NOT NULL DEFAULT 0,
    "date_column" VARCHAR(50),
    "date_format" VARCHAR(50),
    "description_column" VARCHAR(50),
    "debit_column" VARCHAR(50),
    "credit_column" VARCHAR(50),
    "amount_column" VARCHAR(50),
    "balance_column" VARCHAR(50),
    "reference_column" VARCHAR(50),
    "closing_balance_cell" VARCHAR(50),
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "sample_row" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_account_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_imports" (
    "id" SERIAL NOT NULL,
    "import_no" VARCHAR(50) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "bank_format_id" INTEGER NOT NULL,
    "statement_year" INTEGER NOT NULL,
    "statement_month" INTEGER NOT NULL,
    "statement_start_date" VARCHAR(20),
    "statement_end_date" VARCHAR(20),
    "statement_opening_balance" DECIMAL(14,2),
    "statement_closing_balance" DECIMAL(14,2),
    "raw_file_name" VARCHAR(255) NOT NULL,
    "raw_file_url" VARCHAR(500),
    "parse_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "parse_error_msg" TEXT,
    "total_lines" INTEGER NOT NULL DEFAULT 0,
    "parsed_lines" INTEGER NOT NULL DEFAULT 0,
    "imported_by" VARCHAR(255),
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" SERIAL NOT NULL,
    "import_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "tx_date" VARCHAR(20) NOT NULL,
    "value_date" VARCHAR(20),
    "description" VARCHAR(500),
    "debit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "running_balance" DECIMAL(14,2),
    "reference_no" VARCHAR(100),
    "transaction_type" VARCHAR(50),
    "match_status" VARCHAR(20) NOT NULL DEFAULT 'unprocessed',
    "matched_transaction_id" INTEGER,
    "matched_by" VARCHAR(20),
    "reconciliation_id" INTEGER,
    "note" TEXT,
    "row_hash" VARCHAR(64),

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" SERIAL NOT NULL,
    "reconciliation_no" VARCHAR(50) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "statement_year" INTEGER NOT NULL,
    "statement_month" INTEGER NOT NULL,
    "import_id" INTEGER,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "closing_balance_system" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "closing_balance_bank" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_bank_lines" INTEGER NOT NULL DEFAULT 0,
    "matched_lines" INTEGER NOT NULL DEFAULT 0,
    "bank_only_lines" INTEGER NOT NULL DEFAULT 0,
    "system_only_lines" INTEGER NOT NULL DEFAULT 0,
    "amount_diff_lines" INTEGER NOT NULL DEFAULT 0,
    "adjustment_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "confirmed_by" VARCHAR(255),
    "confirmed_at" TIMESTAMP(3),
    "difference_explained" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_merchant_configs" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "bank_name" VARCHAR(100) NOT NULL,
    "merchant_id" VARCHAR(50) NOT NULL,
    "merchant_name" VARCHAR(200) NOT NULL,
    "account_no" VARCHAR(100),
    "account_name" VARCHAR(200),
    "cash_account_id" INTEGER,
    "domestic_fee_rate" DECIMAL(5,2) NOT NULL DEFAULT 1.70,
    "foreign_fee_rate" DECIMAL(5,2) NOT NULL DEFAULT 2.30,
    "self_fee_rate" DECIMAL(5,2) NOT NULL DEFAULT 1.70,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_card_merchant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_statements" (
    "id" SERIAL NOT NULL,
    "merchant_config_id" INTEGER,
    "warehouse_id" INTEGER,
    "warehouse" VARCHAR(100) NOT NULL,
    "bank_name" VARCHAR(100),
    "provider" VARCHAR(100),
    "merchant_id" VARCHAR(50),
    "merchant_name" VARCHAR(200),
    "billing_date" VARCHAR(20) NOT NULL,
    "payment_date" VARCHAR(20),
    "bank_account_id" INTEGER,
    "account_no" VARCHAR(100),
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "service_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pms_amount" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "card_breakdown" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "income_tx_id" INTEGER,
    "fee_tx_id" INTEGER,
    "confirmed_by" VARCHAR(255),
    "confirmed_at" TIMESTAMP(3),
    "imported_by" VARCHAR(255),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_card_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_batch_lines" (
    "id" SERIAL NOT NULL,
    "statement_id" INTEGER NOT NULL,
    "billing_date" VARCHAR(20) NOT NULL,
    "settlement_date" VARCHAR(20),
    "terminal_id" VARCHAR(50),
    "batch_no" VARCHAR(20),
    "card_type" VARCHAR(20) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_card_batch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_fee_details" (
    "id" SERIAL NOT NULL,
    "statement_id" INTEGER NOT NULL,
    "origin" VARCHAR(20) NOT NULL,
    "card_type" VARCHAR(20) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL,
    "fee" DECIMAL(14,2) NOT NULL,
    "fee_rate" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_card_fee_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" SERIAL NOT NULL,
    "order_no" VARCHAR(50) NOT NULL,
    "invoice_ids" JSONB NOT NULL DEFAULT '[]',
    "supplier_id" INTEGER,
    "supplier_name" VARCHAR(255),
    "warehouse" VARCHAR(100),
    "payment_method" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "due_date" VARCHAR(20),
    "account_id" INTEGER,
    "check_no" VARCHAR(50),
    "check_account" VARCHAR(100),
    "check_issue_date" VARCHAR(20),
    "check_due_date" VARCHAR(20),
    "summary" VARCHAR(500),
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT '待出納',
    "source_type" VARCHAR(50),
    "source_record_id" INTEGER,
    "created_by" VARCHAR(255),
    "rejected_by" VARCHAR(255),
    "rejected_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashier_executions" (
    "id" SERIAL NOT NULL,
    "execution_no" VARCHAR(50) NOT NULL,
    "payment_order_id" INTEGER NOT NULL,
    "execution_date" VARCHAR(20) NOT NULL,
    "actual_amount" DECIMAL(12,2) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "payment_method" VARCHAR(50) NOT NULL,
    "check_no" VARCHAR(50),
    "cash_transaction_id" INTEGER,
    "check_id" INTEGER,
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT '已確認',
    "executed_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashier_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "common_expense_templates" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "summary" VARCHAR(500),
    "template_type" VARCHAR(20) NOT NULL DEFAULT 'fixed',
    "category_id" INTEGER,
    "warehouse" VARCHAR(100),
    "default_supplier_id" INTEGER,
    "payment_method" VARCHAR(50),
    "purchase_items" JSONB,
    "default_tax_type" VARCHAR(20),
    "warehouse_account_map" JSONB,
    "warehouse_amounts" JSONB,
    "default_debit_code" VARCHAR(20),
    "default_debit_name" VARCHAR(100),
    "default_credit_code" VARCHAR(20),
    "default_credit_name" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "common_expense_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_entry_lines" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "entry_type" VARCHAR(10) NOT NULL,
    "accounting_code" VARCHAR(20) NOT NULL,
    "accounting_name" VARCHAR(100) NOT NULL,
    "summary" VARCHAR(500),
    "default_amount" DECIMAL(15,2),
    "supplier_id" INTEGER,
    "supplier_name" VARCHAR(255),
    "warehouse" VARCHAR(100),
    "payment_method" VARCHAR(50),
    "account_id" INTEGER,
    "advanced_by" VARCHAR(100),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "common_expense_records" (
    "id" SERIAL NOT NULL,
    "record_no" VARCHAR(50) NOT NULL,
    "template_id" INTEGER NOT NULL,
    "execution_type" VARCHAR(20) NOT NULL DEFAULT 'fixed',
    "warehouse" VARCHAR(100) NOT NULL,
    "expense_month" VARCHAR(7) NOT NULL,
    "supplier_id" INTEGER,
    "supplier_name" VARCHAR(255),
    "payment_method" VARCHAR(50),
    "total_debit" DECIMAL(15,2) NOT NULL,
    "total_credit" DECIMAL(15,2) NOT NULL,
    "purchase_master_id" INTEGER,
    "sales_master_id" INTEGER,
    "payment_order_id" INTEGER,
    "linked_purchase_no" VARCHAR(50),
    "linked_sales_no" VARCHAR(50),
    "linked_payment_order_no" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT '待確認',
    "confirmed_by" VARCHAR(255),
    "confirmed_at" TIMESTAMP(3),
    "voided_by" VARCHAR(255),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "note" TEXT,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "common_expense_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_entry_lines" (
    "id" SERIAL NOT NULL,
    "record_id" INTEGER NOT NULL,
    "entry_type" VARCHAR(10) NOT NULL,
    "accounting_code" VARCHAR(20) NOT NULL,
    "accounting_name" VARCHAR(100) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "record_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_count_configs" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "count_frequency" VARCHAR(20) NOT NULL DEFAULT 'daily',
    "alert_after_days" INTEGER NOT NULL DEFAULT 1,
    "shortage_threshold" DECIMAL(12,2) NOT NULL DEFAULT 5000,
    "require_dual_review" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_count_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_counts" (
    "id" SERIAL NOT NULL,
    "count_no" VARCHAR(50) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "count_date" VARCHAR(20) NOT NULL,
    "count_year" INTEGER NOT NULL,
    "count_month" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "is_abnormal" BOOLEAN NOT NULL DEFAULT false,
    "difference" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "difference_type" VARCHAR(20) NOT NULL DEFAULT 'balanced',
    "system_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actual_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "counted_by_user_id" INTEGER NOT NULL,
    "counted_at" TIMESTAMP(3),
    "reviewed_by_user_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "cash_transaction_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_count_details" (
    "id" SERIAL NOT NULL,
    "count_id" INTEGER NOT NULL,
    "denomination" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "note" VARCHAR(500),

    CONSTRAINT "cash_count_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "year_end_rollovers" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT '進行中',
    "rolled_over_by" VARCHAR(255),
    "rolled_over_at" TIMESTAMP(3),
    "pre_check_results" JSONB,
    "completed_sections" JSONB,
    "retained_earnings" DECIMAL(14,2),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "year_end_rollovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "year_end_inventories" (
    "id" SERIAL NOT NULL,
    "year_end_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "product_code" VARCHAR(50) NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "cost_price" DECIMAL(12,2) NOT NULL,
    "closing_quantity" DECIMAL(10,2) NOT NULL,
    "closing_value" DECIMAL(14,2) NOT NULL,
    "is_negative" BOOLEAN NOT NULL DEFAULT false,
    "adjusted_to_zero" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "year_end_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "year_end_balance_records" (
    "id" SERIAL NOT NULL,
    "year_end_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "account_name" VARCHAR(100) NOT NULL,
    "account_type" VARCHAR(20),
    "closing_balance" DECIMAL(14,2) NOT NULL,
    "next_year_opening_balance" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "year_end_balance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "year_end_financial_statements" (
    "id" SERIAL NOT NULL,
    "year_end_id" INTEGER NOT NULL,
    "statement_type" VARCHAR(50) NOT NULL,
    "statement_data" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by" VARCHAR(255),

    CONSTRAINT "year_end_financial_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_alert_logs" (
    "id" SERIAL NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "error_alert_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_denominations" (
    "id" SERIAL NOT NULL,
    "denomination" DECIMAL(10,2) NOT NULL,
    "denomination_type" VARCHAR(10) NOT NULL,
    "description" VARCHAR(100),
    "is_system_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_denominations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_sessions" (
    "id" SERIAL NOT NULL,
    "session_no" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "opening_date" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "import_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "import_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "file_name" VARCHAR(255),
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "error_details" JSONB,
    "imported_by" VARCHAR(255),
    "imported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_logs" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "result" VARCHAR(20) NOT NULL,
    "detail" TEXT,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_business_reports" (
    "id" SERIAL NOT NULL,
    "report_no" VARCHAR(50) NOT NULL,
    "report_year" INTEGER NOT NULL,
    "report_month" INTEGER NOT NULL,
    "warehouse" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "profit_analysis" JSONB,
    "cash_flow_analysis" JSONB,
    "risk_analysis" JSONB,
    "financial_efficiency" JSONB,
    "decision_recommendations" JSONB,
    "executive_summary" TEXT,
    "generated_at" TIMESTAMP(3),
    "generated_by" VARCHAR(255),
    "approved_by" VARCHAR(255),
    "approved_at" TIMESTAMP(3),
    "rejected_by" VARCHAR(255),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "sent_to_email" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_business_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_kpis" (
    "id" SERIAL NOT NULL,
    "kpi_code" VARCHAR(50) NOT NULL,
    "kpi_name" VARCHAR(100) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "formula" TEXT,
    "unit" VARCHAR(20),
    "target_value" DECIMAL(12,4),
    "warning_threshold" DECIMAL(12,4),
    "critical_threshold" DECIMAL(12,4),
    "diagnostic_rules" JSONB,
    "suggested_actions" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_alerts" (
    "id" SERIAL NOT NULL,
    "alert_type" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "affected_period" VARCHAR(20),
    "metric_value" DECIMAL(12,4),
    "threshold" DECIMAL(12,4),
    "details" JSONB,
    "acknowledged_by" VARCHAR(255),
    "acknowledged_at" TIMESTAMP(3),
    "resolved_by" VARCHAR(255),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transaction_suggestions" (
    "id" SERIAL NOT NULL,
    "reconciliation_id" INTEGER NOT NULL,
    "suggestion_type" VARCHAR(50) NOT NULL,
    "transaction_date" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" VARCHAR(500),
    "suggested_account" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "accepted_by_id" INTEGER,
    "accepted_at" TIMESTAMP(3),
    "created_tx_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transaction_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_snapshots" (
    "id" SERIAL NOT NULL,
    "audit_log_id" INTEGER NOT NULL,
    "snapshot_type" VARCHAR(20) NOT NULL,
    "model_name" VARCHAR(100) NOT NULL,
    "record_id" INTEGER,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "critical_operation_records" (
    "id" SERIAL NOT NULL,
    "operation_code" VARCHAR(50) NOT NULL,
    "operator_id" INTEGER NOT NULL,
    "operator_name" VARCHAR(100) NOT NULL,
    "target_module" VARCHAR(50) NOT NULL,
    "target_id" INTEGER,
    "target_no" VARCHAR(100),
    "amount" DECIMAL(14,2),
    "previous_audit_id" INTEGER,
    "audit_log_id" INTEGER NOT NULL,
    "compliance_result" VARCHAR(20),
    "compliance_details" JSONB,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "critical_operation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_projects" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "client_name" VARCHAR(255),
    "start_date" VARCHAR(20),
    "end_date" VARCHAR(20),
    "budget" DECIMAL(14,2),
    "status" VARCHAR(20) NOT NULL DEFAULT '進行中',
    "warehouse" VARCHAR(100),
    "warehouse_id" INTEGER,
    "department_id" INTEGER,
    "location" VARCHAR(500),
    "building_no" VARCHAR(100),
    "permit_no" VARCHAR(100),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "client_contract_amount" DECIMAL(14,2),

    CONSTRAINT "engineering_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_contracts" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "contract_no" VARCHAR(100) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "sign_date" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "content" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_contract_terms" (
    "id" SERIAL NOT NULL,
    "contract_id" INTEGER NOT NULL,
    "term_no" INTEGER NOT NULL,
    "term_name" VARCHAR(100),
    "content" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "due_date" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "paid_at" VARCHAR(20),
    "payment_order_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_contract_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_materials" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "contract_id" INTEGER,
    "term_id" INTEGER,
    "product_id" INTEGER,
    "description" VARCHAR(500),
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" VARCHAR(20),
    "unit_price" DECIMAL(12,2) NOT NULL,
    "used_at" VARCHAR(20),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_incomes" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "term_name" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "received_date" VARCHAR(20) NOT NULL,
    "account_id" INTEGER,
    "accounting_subject" VARCHAR(100),
    "note" TEXT,
    "cash_transaction_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_input_invoices" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "contract_id" INTEGER,
    "supplier_name" VARCHAR(255),
    "invoice_no" VARCHAR(100),
    "invoice_date" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "invoice_type" VARCHAR(30),
    "status" VARCHAR(20) NOT NULL DEFAULT '已取得',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_input_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_output_invoices" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "client_name" VARCHAR(255),
    "invoice_no" VARCHAR(100),
    "invoice_date" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "invoice_type" VARCHAR(30),
    "status" VARCHAR(20) NOT NULL DEFAULT '已開立',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_output_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_allowances" (
    "id" SERIAL NOT NULL,
    "allowance_no" VARCHAR(50) NOT NULL,
    "allowance_type" VARCHAR(20) NOT NULL DEFAULT '折讓',
    "allowance_date" VARCHAR(20) NOT NULL,
    "supplier_id" INTEGER,
    "supplier_name" VARCHAR(255),
    "warehouse" VARCHAR(100),
    "purchase_id" INTEGER,
    "purchase_no" VARCHAR(50),
    "invoice_id" INTEGER,
    "invoice_no" VARCHAR(50),
    "payment_order_id" INTEGER,
    "payment_order_no" VARCHAR(50),
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refund_account_id" INTEGER,
    "cash_transaction_id" INTEGER,
    "cash_transaction_no" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT '草稿',
    "credit_note_no" VARCHAR(50),
    "reason" TEXT,
    "note" TEXT,
    "confirmed_by" VARCHAR(255),
    "confirmed_at" TIMESTAMP(3),
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowance_details" (
    "id" SERIAL NOT NULL,
    "allowance_id" INTEGER NOT NULL,
    "product_name" VARCHAR(255),
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT,

    CONSTRAINT "allowance_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnb_booking_records" (
    "id" SERIAL NOT NULL,
    "import_month" VARCHAR(7) NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL DEFAULT '民宿',
    "source" VARCHAR(50) NOT NULL,
    "guest_name" VARCHAR(255) NOT NULL,
    "room_no" VARCHAR(50),
    "check_in_date" VARCHAR(20) NOT NULL,
    "check_out_date" VARCHAR(20) NOT NULL,
    "room_charge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_charge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT '已入住',
    "pay_deposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit_date" VARCHAR(20),
    "deposit_last5" VARCHAR(10),
    "pay_transfer" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transfer_date" VARCHAR(20),
    "transfer_last5" VARCHAR(10),
    "pay_card" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pay_cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pay_voucher" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "card_fee_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "card_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_filled" BOOLEAN NOT NULL DEFAULT false,
    "is_complimentary" BOOLEAN NOT NULL DEFAULT false,
    "payment_locked" BOOLEAN NOT NULL DEFAULT false,
    "payment_locked_at" TIMESTAMP(3),
    "payment_locked_by" VARCHAR(255),
    "deposit_bank_line_id" INTEGER,
    "deposit_matched_at" TIMESTAMP(3),
    "deposit_matched_by" VARCHAR(255),
    "transfer_bank_line_id" INTEGER,
    "transfer_matched_at" TIMESTAMP(3),
    "transfer_matched_by" VARCHAR(255),
    "cash_destination" VARCHAR(20),
    "cash_deposit_date" VARCHAR(10),
    "cash_bank_line_id" INTEGER,
    "cash_matched_at" TIMESTAMP(3),
    "cash_matched_by" VARCHAR(255),
    "boss_withdraw_note" VARCHAR(255),
    "card_settlement_date" VARCHAR(10),
    "card_bank_line_id" INTEGER,
    "card_matched_at" TIMESTAMP(3),
    "card_matched_by" VARCHAR(255),
    "deposit_match_skip" VARCHAR(20),
    "deposit_match_skip_note" VARCHAR(255),
    "transfer_match_skip" VARCHAR(20),
    "transfer_match_skip_note" VARCHAR(255),
    "card_match_skip" VARCHAR(20),
    "card_match_skip_note" VARCHAR(255),
    "cash_match_skip" VARCHAR(20),
    "cash_match_skip_note" VARCHAR(255),
    "deposit_cash_tx_id" INTEGER,
    "transfer_cash_tx_id" INTEGER,
    "cash_cash_tx_id" INTEGER,
    "card_cash_tx_id" INTEGER,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(255),
    "previous_status" VARCHAR(20),

    CONSTRAINT "bnb_booking_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnb_boss_withdraws" (
    "id" SERIAL NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "withdraw_date" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "booking_id" INTEGER,
    "guest_name" VARCHAR(255),
    "note" VARCHAR(500),
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" VARCHAR(255),

    CONSTRAINT "bnb_boss_withdraws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnb_recurring_expenses" (
    "id" SERIAL NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "default_amt" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bnb_recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnb_other_income" (
    "id" SERIAL NOT NULL,
    "import_month" VARCHAR(7) NOT NULL,
    "warehouse" VARCHAR(50) NOT NULL,
    "income_date" VARCHAR(10) NOT NULL,
    "category" VARCHAR(100),
    "description" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" VARCHAR(500),
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bnb_other_income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnb_monthly_reports" (
    "id" SERIAL NOT NULL,
    "report_month" VARCHAR(7) NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL DEFAULT '民宿',
    "card_total" DECIMAL(12,2),
    "room_price_total" DECIMAL(12,2),
    "subsidized_rooms" INTEGER,
    "avg_room_rate" DECIMAL(12,2),
    "monthly_room_count" INTEGER,
    "room_supplies_cost" DECIMAL(12,2),
    "fb_expense" DECIMAL(12,2),
    "fit_guest_count" INTEGER,
    "staff_count" INTEGER,
    "salary" DECIMAL(12,2),
    "business_source" VARCHAR(255),
    "other_income" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_income_note" VARCHAR(500),
    "note" TEXT,
    "locked_at" TIMESTAMP(3),
    "locked_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bnb_monthly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnb_lock_audits" (
    "id" SERIAL NOT NULL,
    "report_month" VARCHAR(7) NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "action" VARCHAR(10) NOT NULL,
    "performed_by" VARCHAR(255) NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "bnb_lock_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_companies" (
    "id" SERIAL NOT NULL,
    "company_name" VARCHAR(100) NOT NULL,
    "tax_id" VARCHAR(20) NOT NULL,
    "note" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_monthly_expenses" (
    "id" SERIAL NOT NULL,
    "expense_month" VARCHAR(7) NOT NULL,
    "invoice_title_id" INTEGER NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "invoice_count" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT '待確認',
    "note" VARCHAR(500),
    "confirmed_by" VARCHAR(255),
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_monthly_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnb_ota_commissions" (
    "id" SERIAL NOT NULL,
    "commission_month" VARCHAR(7) NOT NULL,
    "ota_source" VARCHAR(50) NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL DEFAULT '民宿',
    "commission_amount" DECIMAL(12,2) NOT NULL,
    "payment_method" VARCHAR(50) NOT NULL DEFAULT '轉帳',
    "note" VARCHAR(500),
    "supplier_id" INTEGER,
    "supplier_name" VARCHAR(255),
    "payment_order_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT '待出納',
    "confirmed_by" VARCHAR(255),
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bnb_ota_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnb_ota_reconcile_logs" (
    "id" SERIAL NOT NULL,
    "reconcile_month" VARCHAR(7) NOT NULL,
    "ota_source" VARCHAR(50) NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL DEFAULT '民宿',
    "date_from" VARCHAR(10),
    "date_to" VARCHAR(10),
    "ota_row_count" INTEGER NOT NULL,
    "bnb_row_count" INTEGER NOT NULL,
    "matched_count" INTEGER NOT NULL,
    "unmatched_ota_cnt" INTEGER NOT NULL,
    "unmatched_bnb_cnt" INTEGER NOT NULL,
    "issue_count" INTEGER NOT NULL,
    "cancelled_count" INTEGER NOT NULL,
    "ota_total" DECIMAL(12,2) NOT NULL,
    "bnb_total" DECIMAL(12,2) NOT NULL,
    "diff" DECIMAL(12,2) NOT NULL,
    "ota_commission" DECIMAL(12,2) NOT NULL,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bnb_ota_reconcile_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnb_sync_failures" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_msg" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "bnb_sync_failures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_itinerary_billings" (
    "id" SERIAL NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "supplier_id" INTEGER,
    "supplier_name" VARCHAR(255) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT '草稿',
    "billing_month" VARCHAR(7) NOT NULL,
    "due_date" VARCHAR(10),
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "settled_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "account_id" INTEGER,
    "notes" VARCHAR(500),
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_itinerary_billings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_itinerary_items" (
    "id" SERIAL NOT NULL,
    "billing_id" INTEGER NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "guest_name" VARCHAR(255),
    "check_in_date" VARCHAR(10),
    "check_out_date" VARCHAR(10),
    "room_type" VARCHAR(100),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_itinerary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_reservation_records" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "business_date" VARCHAR(10) NOT NULL,
    "booking_no" VARCHAR(50),
    "reservation_no" VARCHAR(50),
    "room_no" VARCHAR(20),
    "room_type" VARCHAR(100),
    "guest_name" VARCHAR(255),
    "company_name" VARCHAR(255),
    "discount_name" VARCHAR(255),
    "check_in" VARCHAR(10),
    "check_out" VARCHAR(10),
    "room_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "service_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_charges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit_card" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wire_transfer" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "complimentary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit_in" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit_out" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receivable" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "voucher" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "source" VARCHAR(50) NOT NULL DEFAULT '電話',
    "source_override" VARCHAR(50),
    "cash_status" VARCHAR(20) NOT NULL DEFAULT '待確認',
    "wire_status" VARCHAR(20) NOT NULL DEFAULT '待確認',
    "commission_status" VARCHAR(20) NOT NULL DEFAULT '待確認',
    "deposit_status" VARCHAR(20) NOT NULL DEFAULT '待確認',
    "credit_card_status" VARCHAR(20) NOT NULL DEFAULT '待核對',
    "cc_fee_rate" DECIMAL(6,4),
    "cc_fee_amount" DECIMAL(12,2),
    "cc_net_amount" DECIMAL(12,2),
    "cc_actual_net" DECIMAL(12,2),
    "cc_diff" DECIMAL(12,2),
    "cc_settle_date" VARCHAR(10),
    "vendor_billing_id" INTEGER,
    "cash_transaction_ids" VARCHAR(500),
    "note" VARCHAR(500),
    "invoice_no" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_reservation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_reservation_cash_links" (
    "id" SERIAL NOT NULL,
    "reservation_id" INTEGER NOT NULL,
    "cash_transaction_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_reservation_cash_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_ota_recon_logs" (
    "id" SERIAL NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "ota_source" VARCHAR(50) NOT NULL,
    "billing_month" VARCHAR(7) NOT NULL,
    "date_from" VARCHAR(10),
    "date_to" VARCHAR(10),
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "unmatched_count" INTEGER NOT NULL DEFAULT 0,
    "total_diff" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "imported_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_ota_recon_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_ota_recon_lines" (
    "id" SERIAL NOT NULL,
    "recon_log_id" INTEGER NOT NULL,
    "reservation_id" INTEGER,
    "ota_reservation_no" VARCHAR(100),
    "ota_guest_name" VARCHAR(255),
    "ota_arrival" VARCHAR(10),
    "ota_departure" VARCHAR(10),
    "ota_final_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ota_commission_amt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ota_commission_pct" DECIMAL(6,4),
    "ota_status" VARCHAR(50),
    "pms_commission_amt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "match_status" VARCHAR(20) NOT NULL DEFAULT 'unmatched',
    "diff_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "pms_ota_recon_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "year_month" VARCHAR(7) NOT NULL,
    "opening_balance" DECIMAL(12,2) NOT NULL,
    "opening_bank_balance" DECIMAL(12,2),
    "closing_bank_balance" DECIMAL(12,2),
    "status" VARCHAR(20) NOT NULL DEFAULT '核對中',
    "note" VARCHAR(500),
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_recon_lines" (
    "id" SERIAL NOT NULL,
    "bank_statement_id" INTEGER NOT NULL,
    "tx_date" VARCHAR(10) NOT NULL,
    "description" VARCHAR(500),
    "credit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "debit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "running_balance" DECIMAL(12,2),
    "matched_tx_id" INTEGER,
    "match_status" VARCHAR(20) NOT NULL DEFAULT '未配對',
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_recon_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_month_closes" (
    "id" SERIAL NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "year_month" VARCHAR(7) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "cash_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wire_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cc_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit_in" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit_out" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ota_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "summary" JSONB,
    "closed_by" VARCHAR(255),
    "closed_at" TIMESTAMP(3),
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_month_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_ota_payments" (
    "id" SERIAL NOT NULL,
    "warehouse" VARCHAR(100) NOT NULL,
    "year_month" VARCHAR(7) NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "expected_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actual_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "diff" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT '待確認',
    "confirmed_date" VARCHAR(10),
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_ota_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" SERIAL NOT NULL,
    "tier" VARCHAR(30) NOT NULL,
    "trigger_type" VARCHAR(30) NOT NULL,
    "business_period" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    "file_path" TEXT,
    "file_size" BIGINT,
    "sha256" VARCHAR(64),
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "table_count" INTEGER,
    "total_records" INTEGER,
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "note" TEXT,
    "created_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_config" (
    "id" SERIAL NOT NULL,
    "encryption_enabled" BOOLEAN NOT NULL DEFAULT false,
    "notify_on_failure" BOOLEAN NOT NULL DEFAULT true,
    "retention_days" INTEGER NOT NULL DEFAULT 90,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_verifications" (
    "id" SERIAL NOT NULL,
    "backup_id" INTEGER NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "details" TEXT,

    CONSTRAINT "backup_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_expenses" (
    "id" SERIAL NOT NULL,
    "expense_date" VARCHAR(20) NOT NULL,
    "invoice_no" VARCHAR(100),
    "invoice_type" VARCHAR(30),
    "vendor_tax_id" VARCHAR(20),
    "vendor_name" VARCHAR(255),
    "item_name" VARCHAR(500),
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "period" VARCHAR(20),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_input_invoices" (
    "id" SERIAL NOT NULL,
    "invoice_date" VARCHAR(20) NOT NULL,
    "invoice_no" VARCHAR(100),
    "vendor_tax_id" VARCHAR(20),
    "vendor_name" VARCHAR(255),
    "material_type" VARCHAR(100),
    "item_name" VARCHAR(500),
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "project_id" INTEGER,
    "location" VARCHAR(255),
    "period" VARCHAR(20),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_input_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_code_idx" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_is_in_stock_idx" ON "products"("is_in_stock");

-- CreateIndex
CREATE INDEX "products_supplier_id_idx" ON "products"("supplier_id");

-- CreateIndex
CREATE INDEX "products_product_type_idx" ON "products"("product_type");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_supplier_code_key" ON "suppliers"("supplier_code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tax_id_key" ON "suppliers"("tax_id");

-- CreateIndex
CREATE INDEX "suppliers_sort_order_idx" ON "suppliers"("sort_order");

-- CreateIndex
CREATE INDEX "suppliers_payment_status_idx" ON "suppliers"("payment_status");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "suppliers_is_active_idx" ON "suppliers"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_type_idx" ON "warehouses"("type");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_parent_id_name_key" ON "warehouses"("parent_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_warehouse_id_name_key" ON "departments"("warehouse_id", "name");

-- CreateIndex
CREATE INDEX "supplier_contracts_supplier_id_idx" ON "supplier_contracts"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_masters_purchase_no_key" ON "purchase_masters"("purchase_no");

-- CreateIndex
CREATE INDEX "purchase_masters_supplier_id_idx" ON "purchase_masters"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_masters_purchase_date_idx" ON "purchase_masters"("purchase_date");

-- CreateIndex
CREATE INDEX "purchase_masters_warehouse_idx" ON "purchase_masters"("warehouse");

-- CreateIndex
CREATE INDEX "purchase_masters_purchase_no_idx" ON "purchase_masters"("purchase_no");

-- CreateIndex
CREATE INDEX "purchase_masters_status_idx" ON "purchase_masters"("status");

-- CreateIndex
CREATE INDEX "purchase_masters_warehouse_purchase_date_idx" ON "purchase_masters"("warehouse", "purchase_date");

-- CreateIndex
CREATE INDEX "purchase_details_purchase_id_idx" ON "purchase_details"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_details_product_id_idx" ON "purchase_details"("product_id");

-- CreateIndex
CREATE INDEX "purchase_details_product_id_purchase_id_idx" ON "purchase_details"("product_id", "purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_masters_sales_no_key" ON "sales_masters"("sales_no");

-- CreateIndex
CREATE INDEX "sales_masters_invoice_no_idx" ON "sales_masters"("invoice_no");

-- CreateIndex
CREATE INDEX "sales_masters_invoice_date_idx" ON "sales_masters"("invoice_date");

-- CreateIndex
CREATE INDEX "sales_masters_invoice_type_idx" ON "sales_masters"("invoice_type");

-- CreateIndex
CREATE INDEX "sales_masters_invoice_type_invoice_date_idx" ON "sales_masters"("invoice_type", "invoice_date");

-- CreateIndex
CREATE INDEX "sales_masters_invoice_title_invoice_date_idx" ON "sales_masters"("invoice_title", "invoice_date");

-- CreateIndex
CREATE INDEX "sales_details_sales_id_idx" ON "sales_details"("sales_id");

-- CreateIndex
CREATE INDEX "sales_details_purchase_item_id_idx" ON "sales_details"("purchase_item_id");

-- CreateIndex
CREATE INDEX "sales_details_product_id_idx" ON "sales_details"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_no_key" ON "payments"("payment_no");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- CreateIndex
CREATE INDEX "expenses_invoice_id_idx" ON "expenses"("invoice_id");

-- CreateIndex
CREATE INDEX "expenses_supplier_id_idx" ON "expenses"("supplier_id");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- CreateIndex
CREATE INDEX "price_history_product_id_idx" ON "price_history"("product_id");

-- CreateIndex
CREATE INDEX "price_history_purchase_date_idx" ON "price_history"("purchase_date");

-- CreateIndex
CREATE INDEX "price_history_product_id_supplier_id_idx" ON "price_history"("product_id", "supplier_id");

-- CreateIndex
CREATE INDEX "price_history_product_id_warehouse_purchase_date_idx" ON "price_history"("product_id", "warehouse", "purchase_date" DESC);

-- CreateIndex
CREATE INDEX "price_history_supplier_id_purchase_date_idx" ON "price_history"("supplier_id", "purchase_date");

-- CreateIndex
CREATE INDEX "price_history_product_id_supplier_id_purchase_date_idx" ON "price_history"("product_id", "supplier_id", "purchase_date" DESC);

-- CreateIndex
CREATE INDEX "price_summary_caches_product_id_supplier_id_idx" ON "price_summary_caches"("product_id", "supplier_id");

-- CreateIndex
CREATE INDEX "price_summary_caches_product_id_warehouse_idx" ON "price_summary_caches"("product_id", "warehouse");

-- CreateIndex
CREATE UNIQUE INDEX "price_summary_caches_product_id_supplier_id_warehouse_key" ON "price_summary_caches"("product_id", "supplier_id", "warehouse");

-- CreateIndex
CREATE INDEX "department_expenses_year_month_idx" ON "department_expenses"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_account_code_key" ON "cash_accounts"("account_code");

-- CreateIndex
CREATE INDEX "cash_accounts_warehouse_idx" ON "cash_accounts"("warehouse");

-- CreateIndex
CREATE INDEX "cash_accounts_type_idx" ON "cash_accounts"("type");

-- CreateIndex
CREATE INDEX "cash_accounts_is_active_idx" ON "cash_accounts"("is_active");

-- CreateIndex
CREATE INDEX "cash_categories_type_idx" ON "cash_categories"("type");

-- CreateIndex
CREATE INDEX "cash_categories_system_code_idx" ON "cash_categories"("system_code");

-- CreateIndex
CREATE INDEX "cash_categories_accounting_subject_id_idx" ON "cash_categories"("accounting_subject_id");

-- CreateIndex
CREATE INDEX "cash_categories_level1_pl_group_idx" ON "cash_categories"("level1", "pl_group");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transactions_transaction_no_key" ON "cash_transactions"("transaction_no");

-- CreateIndex
CREATE INDEX "cash_transactions_transaction_date_idx" ON "cash_transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "cash_transactions_account_id_idx" ON "cash_transactions"("account_id");

-- CreateIndex
CREATE INDEX "cash_transactions_type_idx" ON "cash_transactions"("type");

-- CreateIndex
CREATE INDEX "cash_transactions_warehouse_idx" ON "cash_transactions"("warehouse");

-- CreateIndex
CREATE INDEX "cash_transactions_payment_no_idx" ON "cash_transactions"("payment_no");

-- CreateIndex
CREATE INDEX "cash_transactions_source_type_source_record_id_idx" ON "cash_transactions"("source_type", "source_record_id");

-- CreateIndex
CREATE INDEX "cash_transactions_account_id_transaction_date_idx" ON "cash_transactions"("account_id", "transaction_date" DESC);

-- CreateIndex
CREATE INDEX "cash_transactions_source_type_transaction_date_idx" ON "cash_transactions"("source_type", "transaction_date");

-- CreateIndex
CREATE INDEX "cash_transactions_is_non_cash_expense_transaction_date_idx" ON "cash_transactions"("is_non_cash_expense", "transaction_date");

-- CreateIndex
CREATE INDEX "cash_transactions_warehouse_transaction_date_idx" ON "cash_transactions"("warehouse", "transaction_date");

-- CreateIndex
CREATE INDEX "cash_transactions_type_transaction_date_idx" ON "cash_transactions"("type", "transaction_date");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_subjects_code_key" ON "accounting_subjects"("code");

-- CreateIndex
CREATE INDEX "accounting_subjects_category_idx" ON "accounting_subjects"("category");

-- CreateIndex
CREATE INDEX "accounting_subjects_code_idx" ON "accounting_subjects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "user_notification_channels_user_id_idx" ON "user_notification_channels"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_channels_user_id_notification_code_key" ON "user_notification_channels"("user_id", "notification_code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_options_name_key" ON "payment_method_options"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE INDEX "expense_categories_category_type_idx" ON "expense_categories"("category_type");

-- CreateIndex
CREATE UNIQUE INDEX "pms_mapping_rules_pms_column_name_entry_type_key" ON "pms_mapping_rules"("pms_column_name", "entry_type");

-- CreateIndex
CREATE UNIQUE INDEX "pms_import_batches_batch_no_key" ON "pms_import_batches"("batch_no");

-- CreateIndex
CREATE INDEX "pms_import_batches_warehouse_business_date_idx" ON "pms_import_batches"("warehouse", "business_date");

-- CreateIndex
CREATE INDEX "pms_import_batches_warehouse_idx" ON "pms_import_batches"("warehouse");

-- CreateIndex
CREATE INDEX "pms_import_batches_business_date_idx" ON "pms_import_batches"("business_date");

-- CreateIndex
CREATE INDEX "pms_import_batches_status_idx" ON "pms_import_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pms_import_batches_warehouse_business_date_key" ON "pms_import_batches"("warehouse", "business_date");

-- CreateIndex
CREATE INDEX "pms_income_records_warehouse_business_date_idx" ON "pms_income_records"("warehouse", "business_date");

-- CreateIndex
CREATE INDEX "pms_income_records_business_date_idx" ON "pms_income_records"("business_date");

-- CreateIndex
CREATE INDEX "pms_income_records_import_batch_id_idx" ON "pms_income_records"("import_batch_id");

-- CreateIndex
CREATE INDEX "pms_income_records_entry_type_idx" ON "pms_income_records"("entry_type");

-- CreateIndex
CREATE INDEX "pms_income_records_cash_transaction_id_idx" ON "pms_income_records"("cash_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "pms_payment_method_configs_warehouse_pms_column_name_key" ON "pms_payment_method_configs"("warehouse", "pms_column_name");

-- CreateIndex
CREATE INDEX "pms_credit_card_fee_entries_warehouse_idx" ON "pms_credit_card_fee_entries"("warehouse");

-- CreateIndex
CREATE INDEX "pms_credit_card_fee_entries_settlement_date_idx" ON "pms_credit_card_fee_entries"("settlement_date");

-- CreateIndex
CREATE UNIQUE INDEX "pms_credit_card_fee_entries_warehouse_settlement_date_key" ON "pms_credit_card_fee_entries"("warehouse", "settlement_date");

-- CreateIndex
CREATE INDEX "pms_monthly_settlements_status_idx" ON "pms_monthly_settlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pms_monthly_settlements_warehouse_settlement_month_key" ON "pms_monthly_settlements"("warehouse", "settlement_month");

-- CreateIndex
CREATE INDEX "travel_agency_commission_configs_data_source_idx" ON "travel_agency_commission_configs"("data_source");

-- CreateIndex
CREATE INDEX "travel_agency_commission_configs_payment_type_idx" ON "travel_agency_commission_configs"("payment_type");

-- CreateIndex
CREATE INDEX "monthly_manual_commission_entries_settlement_month_idx" ON "monthly_manual_commission_entries"("settlement_month");

-- CreateIndex
CREATE INDEX "monthly_manual_commission_entries_status_idx" ON "monthly_manual_commission_entries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "loan_masters_loan_code_key" ON "loan_masters"("loan_code");

-- CreateIndex
CREATE INDEX "loan_masters_warehouse_idx" ON "loan_masters"("warehouse");

-- CreateIndex
CREATE INDEX "loan_masters_status_idx" ON "loan_masters"("status");

-- CreateIndex
CREATE INDEX "loan_masters_deduct_account_id_idx" ON "loan_masters"("deduct_account_id");

-- CreateIndex
CREATE INDEX "loan_rate_histories_loan_id_idx" ON "loan_rate_histories"("loan_id");

-- CreateIndex
CREATE INDEX "loan_monthly_records_loan_id_idx" ON "loan_monthly_records"("loan_id");

-- CreateIndex
CREATE INDEX "loan_monthly_records_record_year_record_month_idx" ON "loan_monthly_records"("record_year", "record_month");

-- CreateIndex
CREATE INDEX "loan_monthly_records_status_idx" ON "loan_monthly_records"("status");

-- CreateIndex
CREATE INDEX "loan_monthly_records_payment_order_id_idx" ON "loan_monthly_records"("payment_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_monthly_records_loan_id_record_year_record_month_key" ON "loan_monthly_records"("loan_id", "record_year", "record_month");

-- CreateIndex
CREATE INDEX "loan_notes_loan_id_idx" ON "loan_notes"("loan_id");

-- CreateIndex
CREATE UNIQUE INDEX "checks_check_no_key" ON "checks"("check_no");

-- CreateIndex
CREATE INDEX "checks_check_type_idx" ON "checks"("check_type");

-- CreateIndex
CREATE INDEX "checks_status_idx" ON "checks"("status");

-- CreateIndex
CREATE INDEX "checks_due_date_idx" ON "checks"("due_date");

-- CreateIndex
CREATE INDEX "checks_warehouse_idx" ON "checks"("warehouse");

-- CreateIndex
CREATE INDEX "checks_supplier_id_idx" ON "checks"("supplier_id");

-- CreateIndex
CREATE INDEX "checks_reissue_of_check_id_idx" ON "checks"("reissue_of_check_id");

-- CreateIndex
CREATE INDEX "checks_status_due_date_idx" ON "checks"("status", "due_date");

-- CreateIndex
CREATE INDEX "month_end_statuses_year_month_idx" ON "month_end_statuses"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "month_end_statuses_year_month_warehouse_key" ON "month_end_statuses"("year", "month", "warehouse");

-- CreateIndex
CREATE INDEX "month_end_reports_month_end_id_idx" ON "month_end_reports"("month_end_id");

-- CreateIndex
CREATE INDEX "month_end_reports_year_month_idx" ON "month_end_reports"("year", "month");

-- CreateIndex
CREATE INDEX "account_monthly_snapshots_snapshot_year_snapshot_month_idx" ON "account_monthly_snapshots"("snapshot_year", "snapshot_month");

-- CreateIndex
CREATE INDEX "account_monthly_snapshots_account_id_snapshot_year_snapshot_idx" ON "account_monthly_snapshots"("account_id", "snapshot_year", "snapshot_month");

-- CreateIndex
CREATE UNIQUE INDEX "account_monthly_snapshots_account_id_snapshot_year_snapshot_key" ON "account_monthly_snapshots"("account_id", "snapshot_year", "snapshot_month");

-- CreateIndex
CREATE INDEX "inventory_monthly_snapshots_product_id_warehouse_idx" ON "inventory_monthly_snapshots"("product_id", "warehouse");

-- CreateIndex
CREATE INDEX "inventory_monthly_snapshots_snapshot_year_snapshot_month_idx" ON "inventory_monthly_snapshots"("snapshot_year", "snapshot_month");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_monthly_snapshots_product_id_warehouse_snapshot_y_key" ON "inventory_monthly_snapshots"("product_id", "warehouse", "snapshot_year", "snapshot_month");

-- CreateIndex
CREATE INDEX "monthly_aggregations_aggregation_type_year_month_idx" ON "monthly_aggregations"("aggregation_type", "year", "month");

-- CreateIndex
CREATE INDEX "monthly_aggregations_aggregation_type_is_finalized_idx" ON "monthly_aggregations"("aggregation_type", "is_finalized");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_aggregations_aggregation_type_year_month_warehouse_key" ON "monthly_aggregations"("aggregation_type", "year", "month", "warehouse");

-- CreateIndex
CREATE UNIQUE INDEX "rental_monthly_caches_property_id_year_month_key" ON "rental_monthly_caches"("property_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_low_stock_caches_product_id_warehouse_key" ON "inventory_low_stock_caches"("product_id", "warehouse");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_requisitions_requisition_no_key" ON "inventory_requisitions"("requisition_no");

-- CreateIndex
CREATE INDEX "inventory_requisitions_warehouse_idx" ON "inventory_requisitions"("warehouse");

-- CreateIndex
CREATE INDEX "inventory_requisitions_requisition_date_idx" ON "inventory_requisitions"("requisition_date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfers_transfer_no_key" ON "inventory_transfers"("transfer_no");

-- CreateIndex
CREATE INDEX "inventory_transfers_from_warehouse_idx" ON "inventory_transfers"("from_warehouse");

-- CreateIndex
CREATE INDEX "inventory_transfers_to_warehouse_idx" ON "inventory_transfers"("to_warehouse");

-- CreateIndex
CREATE INDEX "inventory_transfers_transfer_date_idx" ON "inventory_transfers"("transfer_date");

-- CreateIndex
CREATE INDEX "inventory_transfer_items_transfer_id_idx" ON "inventory_transfer_items"("transfer_id");

-- CreateIndex
CREATE INDEX "inventory_transfer_items_product_id_idx" ON "inventory_transfer_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_count_no_key" ON "stock_counts"("count_no");

-- CreateIndex
CREATE INDEX "stock_counts_warehouse_idx" ON "stock_counts"("warehouse");

-- CreateIndex
CREATE INDEX "stock_counts_count_date_idx" ON "stock_counts"("count_date");

-- CreateIndex
CREATE INDEX "stock_count_items_count_id_idx" ON "stock_count_items"("count_id");

-- CreateIndex
CREATE INDEX "stock_count_items_product_id_idx" ON "stock_count_items"("product_id");

-- CreateIndex
CREATE INDEX "supplier_monthly_summaries_supplier_id_year_month_idx" ON "supplier_monthly_summaries"("supplier_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_monthly_summaries_supplier_id_year_month_warehouse_key" ON "supplier_monthly_summaries"("supplier_id", "year", "month", "warehouse");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_notification_code_key" ON "notifications"("notification_code");

-- CreateIndex
CREATE INDEX "notification_delivery_logs_notification_code_idx" ON "notification_delivery_logs"("notification_code");

-- CreateIndex
CREATE INDEX "notification_delivery_logs_user_id_idx" ON "notification_delivery_logs"("user_id");

-- CreateIndex
CREATE INDEX "notification_delivery_logs_status_idx" ON "notification_delivery_logs"("status");

-- CreateIndex
CREATE INDEX "notification_delivery_logs_created_at_idx" ON "notification_delivery_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_target_module_idx" ON "audit_logs"("target_module");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_level_created_at_idx" ON "audit_logs"("level", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_module_action_created_at_idx" ON "audit_logs"("target_module", "action", "created_at");

-- CreateIndex
CREATE INDEX "attachments_source_module_source_record_id_idx" ON "attachments"("source_module", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_masters_tenant_code_key" ON "tenant_masters"("tenant_code");

-- CreateIndex
CREATE INDEX "rental_properties_building_name_idx" ON "rental_properties"("building_name");

-- CreateIndex
CREATE INDEX "rental_properties_status_idx" ON "rental_properties"("status");

-- CreateIndex
CREATE INDEX "rental_properties_sort_order_idx" ON "rental_properties"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "assets_rental_property_id_key" ON "assets"("rental_property_id");

-- CreateIndex
CREATE INDEX "assets_asset_type_idx" ON "assets"("asset_type");

-- CreateIndex
CREATE INDEX "assets_sort_order_idx" ON "assets"("sort_order");

-- CreateIndex
CREATE INDEX "asset_disposals_asset_id_idx" ON "asset_disposals"("asset_id");

-- CreateIndex
CREATE INDEX "rental_annual_rent_filings_filing_year_idx" ON "rental_annual_rent_filings"("filing_year");

-- CreateIndex
CREATE INDEX "rental_annual_rent_filings_contract_id_idx" ON "rental_annual_rent_filings"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_annual_rent_filings_property_id_filing_year_slot_ind_key" ON "rental_annual_rent_filings"("property_id", "filing_year", "slot_index");

-- CreateIndex
CREATE INDEX "rental_utility_incomes_property_id_idx" ON "rental_utility_incomes"("property_id");

-- CreateIndex
CREATE INDEX "rental_utility_incomes_income_year_income_month_idx" ON "rental_utility_incomes"("income_year", "income_month");

-- CreateIndex
CREATE UNIQUE INDEX "rental_utility_incomes_property_id_income_year_income_month_key" ON "rental_utility_incomes"("property_id", "income_year", "income_month");

-- CreateIndex
CREATE INDEX "utility_bill_records_warehouse_idx" ON "utility_bill_records"("warehouse");

-- CreateIndex
CREATE INDEX "utility_bill_records_bill_year_bill_month_idx" ON "utility_bill_records"("bill_year", "bill_month");

-- CreateIndex
CREATE INDEX "utility_bill_records_payment_order_id_idx" ON "utility_bill_records"("payment_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "utility_bill_records_warehouse_bill_year_bill_month_bill_ty_key" ON "utility_bill_records"("warehouse", "bill_year", "bill_month", "bill_type");

-- CreateIndex
CREATE UNIQUE INDEX "rental_contracts_contract_no_key" ON "rental_contracts"("contract_no");

-- CreateIndex
CREATE INDEX "rental_contracts_property_id_idx" ON "rental_contracts"("property_id");

-- CreateIndex
CREATE INDEX "rental_contracts_tenant_id_idx" ON "rental_contracts"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_contracts_status_idx" ON "rental_contracts"("status");

-- CreateIndex
CREATE INDEX "rental_contracts_previous_contract_id_idx" ON "rental_contracts"("previous_contract_id");

-- CreateIndex
CREATE INDEX "contract_reminders_contract_id_idx" ON "contract_reminders"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_year_locks_year_key" ON "rental_year_locks"("year");

-- CreateIndex
CREATE INDEX "rental_incomes_property_id_idx" ON "rental_incomes"("property_id");

-- CreateIndex
CREATE INDEX "rental_incomes_tenant_id_idx" ON "rental_incomes"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_incomes_income_year_income_month_idx" ON "rental_incomes"("income_year", "income_month");

-- CreateIndex
CREATE INDEX "rental_incomes_status_idx" ON "rental_incomes"("status");

-- CreateIndex
CREATE INDEX "rental_incomes_status_due_date_idx" ON "rental_incomes"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "rental_incomes_contract_id_income_year_income_month_key" ON "rental_incomes"("contract_id", "income_year", "income_month");

-- CreateIndex
CREATE INDEX "rental_income_payments_rental_income_id_idx" ON "rental_income_payments"("rental_income_id");

-- CreateIndex
CREATE INDEX "rental_income_payments_account_id_idx" ON "rental_income_payments"("account_id");

-- CreateIndex
CREATE INDEX "property_taxes_property_id_idx" ON "property_taxes"("property_id");

-- CreateIndex
CREATE INDEX "property_taxes_tax_year_idx" ON "property_taxes"("tax_year");

-- CreateIndex
CREATE INDEX "property_taxes_status_idx" ON "property_taxes"("status");

-- CreateIndex
CREATE INDEX "property_taxes_payment_order_id_idx" ON "property_taxes"("payment_order_id");

-- CreateIndex
CREATE INDEX "rental_maintenances_property_id_idx" ON "rental_maintenances"("property_id");

-- CreateIndex
CREATE INDEX "rental_maintenances_status_idx" ON "rental_maintenances"("status");

-- CreateIndex
CREATE INDEX "rental_maintenances_payment_order_id_idx" ON "rental_maintenances"("payment_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_advances_advance_no_key" ON "employee_advances"("advance_no");

-- CreateIndex
CREATE INDEX "employee_advances_employee_name_idx" ON "employee_advances"("employee_name");

-- CreateIndex
CREATE INDEX "employee_advances_status_idx" ON "employee_advances"("status");

-- CreateIndex
CREATE INDEX "employee_advances_payment_order_id_idx" ON "employee_advances"("payment_order_id");

-- CreateIndex
CREATE INDEX "employee_advances_source_type_source_record_id_idx" ON "employee_advances"("source_type", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_imports_import_no_key" ON "bank_statement_imports"("import_no");

-- CreateIndex
CREATE INDEX "bank_statement_imports_account_id_idx" ON "bank_statement_imports"("account_id");

-- CreateIndex
CREATE INDEX "bank_statement_imports_statement_year_statement_month_idx" ON "bank_statement_imports"("statement_year", "statement_month");

-- CreateIndex
CREATE INDEX "bank_statement_lines_import_id_idx" ON "bank_statement_lines"("import_id");

-- CreateIndex
CREATE INDEX "bank_statement_lines_account_id_idx" ON "bank_statement_lines"("account_id");

-- CreateIndex
CREATE INDEX "bank_statement_lines_tx_date_idx" ON "bank_statement_lines"("tx_date");

-- CreateIndex
CREATE INDEX "bank_statement_lines_match_status_idx" ON "bank_statement_lines"("match_status");

-- CreateIndex
CREATE INDEX "bank_statement_lines_account_id_tx_date_idx" ON "bank_statement_lines"("account_id", "tx_date");

-- CreateIndex
CREATE INDEX "bank_statement_lines_reconciliation_id_idx" ON "bank_statement_lines"("reconciliation_id");

-- CreateIndex
CREATE INDEX "bank_statement_lines_row_hash_idx" ON "bank_statement_lines"("row_hash");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconciliations_reconciliation_no_key" ON "bank_reconciliations"("reconciliation_no");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconciliations_import_id_key" ON "bank_reconciliations"("import_id");

-- CreateIndex
CREATE INDEX "bank_reconciliations_account_id_idx" ON "bank_reconciliations"("account_id");

-- CreateIndex
CREATE INDEX "bank_reconciliations_statement_year_statement_month_idx" ON "bank_reconciliations"("statement_year", "statement_month");

-- CreateIndex
CREATE INDEX "bank_reconciliations_status_idx" ON "bank_reconciliations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconciliations_account_id_statement_year_statement_mo_key" ON "bank_reconciliations"("account_id", "statement_year", "statement_month");

-- CreateIndex
CREATE INDEX "credit_card_merchant_configs_warehouse_id_idx" ON "credit_card_merchant_configs"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_merchant_configs_warehouse_id_merchant_id_key" ON "credit_card_merchant_configs"("warehouse_id", "merchant_id");

-- CreateIndex
CREATE INDEX "credit_card_statements_warehouse_id_idx" ON "credit_card_statements"("warehouse_id");

-- CreateIndex
CREATE INDEX "credit_card_statements_billing_date_idx" ON "credit_card_statements"("billing_date");

-- CreateIndex
CREATE INDEX "credit_card_statements_status_idx" ON "credit_card_statements"("status");

-- CreateIndex
CREATE INDEX "credit_card_statements_warehouse_billing_date_idx" ON "credit_card_statements"("warehouse", "billing_date");

-- CreateIndex
CREATE INDEX "credit_card_batch_lines_statement_id_idx" ON "credit_card_batch_lines"("statement_id");

-- CreateIndex
CREATE INDEX "credit_card_fee_details_statement_id_idx" ON "credit_card_fee_details"("statement_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_order_no_key" ON "payment_orders"("order_no");

-- CreateIndex
CREATE INDEX "payment_orders_status_idx" ON "payment_orders"("status");

-- CreateIndex
CREATE INDEX "payment_orders_supplier_id_idx" ON "payment_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "payment_orders_warehouse_idx" ON "payment_orders"("warehouse");

-- CreateIndex
CREATE INDEX "payment_orders_due_date_idx" ON "payment_orders"("due_date");

-- CreateIndex
CREATE INDEX "payment_orders_source_type_idx" ON "payment_orders"("source_type");

-- CreateIndex
CREATE INDEX "payment_orders_order_no_idx" ON "payment_orders"("order_no");

-- CreateIndex
CREATE INDEX "payment_orders_created_at_idx" ON "payment_orders"("created_at");

-- CreateIndex
CREATE INDEX "payment_orders_status_created_at_idx" ON "payment_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_orders_warehouse_status_idx" ON "payment_orders"("warehouse", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cashier_executions_execution_no_key" ON "cashier_executions"("execution_no");

-- CreateIndex
CREATE INDEX "cashier_executions_payment_order_id_idx" ON "cashier_executions"("payment_order_id");

-- CreateIndex
CREATE INDEX "cashier_executions_account_id_idx" ON "cashier_executions"("account_id");

-- CreateIndex
CREATE INDEX "common_expense_templates_category_id_idx" ON "common_expense_templates"("category_id");

-- CreateIndex
CREATE INDEX "common_expense_templates_is_active_idx" ON "common_expense_templates"("is_active");

-- CreateIndex
CREATE INDEX "common_expense_templates_template_type_idx" ON "common_expense_templates"("template_type");

-- CreateIndex
CREATE INDEX "template_entry_lines_template_id_idx" ON "template_entry_lines"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "common_expense_records_record_no_key" ON "common_expense_records"("record_no");

-- CreateIndex
CREATE INDEX "common_expense_records_template_id_idx" ON "common_expense_records"("template_id");

-- CreateIndex
CREATE INDEX "common_expense_records_warehouse_idx" ON "common_expense_records"("warehouse");

-- CreateIndex
CREATE INDEX "common_expense_records_expense_month_idx" ON "common_expense_records"("expense_month");

-- CreateIndex
CREATE INDEX "common_expense_records_status_idx" ON "common_expense_records"("status");

-- CreateIndex
CREATE INDEX "common_expense_records_execution_type_idx" ON "common_expense_records"("execution_type");

-- CreateIndex
CREATE INDEX "record_entry_lines_record_id_idx" ON "record_entry_lines"("record_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_count_configs_account_id_key" ON "cash_count_configs"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_counts_count_no_key" ON "cash_counts"("count_no");

-- CreateIndex
CREATE INDEX "cash_counts_account_id_idx" ON "cash_counts"("account_id");

-- CreateIndex
CREATE INDEX "cash_counts_count_date_idx" ON "cash_counts"("count_date");

-- CreateIndex
CREATE INDEX "cash_counts_count_year_count_month_idx" ON "cash_counts"("count_year", "count_month");

-- CreateIndex
CREATE INDEX "cash_counts_status_idx" ON "cash_counts"("status");

-- CreateIndex
CREATE INDEX "cash_count_details_count_id_idx" ON "cash_count_details"("count_id");

-- CreateIndex
CREATE UNIQUE INDEX "year_end_rollovers_year_key" ON "year_end_rollovers"("year");

-- CreateIndex
CREATE INDEX "year_end_rollovers_year_idx" ON "year_end_rollovers"("year");

-- CreateIndex
CREATE INDEX "year_end_inventories_year_end_id_idx" ON "year_end_inventories"("year_end_id");

-- CreateIndex
CREATE INDEX "year_end_inventories_product_id_idx" ON "year_end_inventories"("product_id");

-- CreateIndex
CREATE INDEX "year_end_balance_records_year_end_id_idx" ON "year_end_balance_records"("year_end_id");

-- CreateIndex
CREATE INDEX "year_end_balance_records_account_id_idx" ON "year_end_balance_records"("account_id");

-- CreateIndex
CREATE INDEX "year_end_financial_statements_year_end_id_idx" ON "year_end_financial_statements"("year_end_id");

-- CreateIndex
CREATE INDEX "error_alert_logs_category_idx" ON "error_alert_logs"("category");

-- CreateIndex
CREATE INDEX "error_alert_logs_occurred_at_idx" ON "error_alert_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "error_alert_logs_resolved_idx" ON "error_alert_logs"("resolved");

-- CreateIndex
CREATE UNIQUE INDEX "import_sessions_session_no_key" ON "import_sessions"("session_no");

-- CreateIndex
CREATE INDEX "import_sessions_status_idx" ON "import_sessions"("status");

-- CreateIndex
CREATE INDEX "import_batches_session_id_idx" ON "import_batches"("session_id");

-- CreateIndex
CREATE INDEX "import_batches_import_type_idx" ON "import_batches"("import_type");

-- CreateIndex
CREATE INDEX "import_batches_status_idx" ON "import_batches"("status");

-- CreateIndex
CREATE INDEX "import_logs_batch_id_idx" ON "import_logs"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_business_reports_report_no_key" ON "monthly_business_reports"("report_no");

-- CreateIndex
CREATE INDEX "monthly_business_reports_report_year_report_month_idx" ON "monthly_business_reports"("report_year", "report_month");

-- CreateIndex
CREATE INDEX "monthly_business_reports_status_idx" ON "monthly_business_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_kpis_kpi_code_key" ON "analytics_kpis"("kpi_code");

-- CreateIndex
CREATE INDEX "analytics_kpis_module_idx" ON "analytics_kpis"("module");

-- CreateIndex
CREATE INDEX "analytics_kpis_is_active_idx" ON "analytics_kpis"("is_active");

-- CreateIndex
CREATE INDEX "risk_alerts_alert_type_idx" ON "risk_alerts"("alert_type");

-- CreateIndex
CREATE INDEX "risk_alerts_severity_status_idx" ON "risk_alerts"("severity", "status");

-- CreateIndex
CREATE INDEX "risk_alerts_created_at_idx" ON "risk_alerts"("created_at");

-- CreateIndex
CREATE INDEX "bank_transaction_suggestions_reconciliation_id_idx" ON "bank_transaction_suggestions"("reconciliation_id");

-- CreateIndex
CREATE INDEX "bank_transaction_suggestions_status_idx" ON "bank_transaction_suggestions"("status");

-- CreateIndex
CREATE INDEX "audit_snapshots_audit_log_id_idx" ON "audit_snapshots"("audit_log_id");

-- CreateIndex
CREATE INDEX "audit_snapshots_model_name_record_id_idx" ON "audit_snapshots"("model_name", "record_id");

-- CreateIndex
CREATE INDEX "critical_operation_records_operation_code_idx" ON "critical_operation_records"("operation_code");

-- CreateIndex
CREATE INDEX "critical_operation_records_operator_id_idx" ON "critical_operation_records"("operator_id");

-- CreateIndex
CREATE INDEX "critical_operation_records_target_module_target_id_idx" ON "critical_operation_records"("target_module", "target_id");

-- CreateIndex
CREATE INDEX "critical_operation_records_created_at_idx" ON "critical_operation_records"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "engineering_projects_code_key" ON "engineering_projects"("code");

-- CreateIndex
CREATE INDEX "engineering_projects_status_idx" ON "engineering_projects"("status");

-- CreateIndex
CREATE INDEX "engineering_projects_warehouse_idx" ON "engineering_projects"("warehouse");

-- CreateIndex
CREATE INDEX "engineering_projects_warehouse_id_idx" ON "engineering_projects"("warehouse_id");

-- CreateIndex
CREATE INDEX "engineering_contracts_project_id_idx" ON "engineering_contracts"("project_id");

-- CreateIndex
CREATE INDEX "engineering_contracts_supplier_id_idx" ON "engineering_contracts"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "engineering_contracts_project_id_contract_no_key" ON "engineering_contracts"("project_id", "contract_no");

-- CreateIndex
CREATE INDEX "engineering_contract_terms_contract_id_idx" ON "engineering_contract_terms"("contract_id");

-- CreateIndex
CREATE INDEX "engineering_contract_terms_status_idx" ON "engineering_contract_terms"("status");

-- CreateIndex
CREATE INDEX "engineering_materials_project_id_idx" ON "engineering_materials"("project_id");

-- CreateIndex
CREATE INDEX "engineering_materials_contract_id_idx" ON "engineering_materials"("contract_id");

-- CreateIndex
CREATE INDEX "engineering_materials_term_id_idx" ON "engineering_materials"("term_id");

-- CreateIndex
CREATE INDEX "engineering_materials_product_id_idx" ON "engineering_materials"("product_id");

-- CreateIndex
CREATE INDEX "engineering_incomes_project_id_idx" ON "engineering_incomes"("project_id");

-- CreateIndex
CREATE INDEX "engineering_input_invoices_project_id_idx" ON "engineering_input_invoices"("project_id");

-- CreateIndex
CREATE INDEX "engineering_input_invoices_contract_id_idx" ON "engineering_input_invoices"("contract_id");

-- CreateIndex
CREATE INDEX "engineering_output_invoices_project_id_idx" ON "engineering_output_invoices"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_allowances_allowance_no_key" ON "purchase_allowances"("allowance_no");

-- CreateIndex
CREATE INDEX "purchase_allowances_supplier_id_idx" ON "purchase_allowances"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_allowances_warehouse_idx" ON "purchase_allowances"("warehouse");

-- CreateIndex
CREATE INDEX "purchase_allowances_status_idx" ON "purchase_allowances"("status");

-- CreateIndex
CREATE INDEX "purchase_allowances_allowance_date_idx" ON "purchase_allowances"("allowance_date");

-- CreateIndex
CREATE INDEX "purchase_allowances_purchase_id_idx" ON "purchase_allowances"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_allowances_invoice_id_idx" ON "purchase_allowances"("invoice_id");

-- CreateIndex
CREATE INDEX "purchase_allowances_payment_order_id_idx" ON "purchase_allowances"("payment_order_id");

-- CreateIndex
CREATE INDEX "allowance_details_allowance_id_idx" ON "allowance_details"("allowance_id");

-- CreateIndex
CREATE INDEX "bnb_booking_records_import_month_idx" ON "bnb_booking_records"("import_month");

-- CreateIndex
CREATE INDEX "bnb_booking_records_warehouse_idx" ON "bnb_booking_records"("warehouse");

-- CreateIndex
CREATE INDEX "bnb_booking_records_check_in_date_idx" ON "bnb_booking_records"("check_in_date");

-- CreateIndex
CREATE INDEX "bnb_booking_records_status_idx" ON "bnb_booking_records"("status");

-- CreateIndex
CREATE INDEX "bnb_booking_records_deleted_at_idx" ON "bnb_booking_records"("deleted_at");

-- CreateIndex
CREATE INDEX "bnb_booking_records_deposit_bank_line_id_idx" ON "bnb_booking_records"("deposit_bank_line_id");

-- CreateIndex
CREATE INDEX "bnb_booking_records_transfer_bank_line_id_idx" ON "bnb_booking_records"("transfer_bank_line_id");

-- CreateIndex
CREATE INDEX "bnb_booking_records_card_bank_line_id_idx" ON "bnb_booking_records"("card_bank_line_id");

-- CreateIndex
CREATE INDEX "bnb_booking_records_cash_bank_line_id_idx" ON "bnb_booking_records"("cash_bank_line_id");

-- CreateIndex
CREATE INDEX "bnb_boss_withdraws_warehouse_idx" ON "bnb_boss_withdraws"("warehouse");

-- CreateIndex
CREATE INDEX "bnb_boss_withdraws_withdraw_date_idx" ON "bnb_boss_withdraws"("withdraw_date");

-- CreateIndex
CREATE INDEX "bnb_boss_withdraws_booking_id_idx" ON "bnb_boss_withdraws"("booking_id");

-- CreateIndex
CREATE INDEX "bnb_boss_withdraws_confirmed_at_idx" ON "bnb_boss_withdraws"("confirmed_at");

-- CreateIndex
CREATE INDEX "bnb_recurring_expenses_warehouse_idx" ON "bnb_recurring_expenses"("warehouse");

-- CreateIndex
CREATE INDEX "bnb_other_income_import_month_idx" ON "bnb_other_income"("import_month");

-- CreateIndex
CREATE INDEX "bnb_other_income_warehouse_idx" ON "bnb_other_income"("warehouse");

-- CreateIndex
CREATE INDEX "bnb_monthly_reports_report_month_idx" ON "bnb_monthly_reports"("report_month");

-- CreateIndex
CREATE UNIQUE INDEX "bnb_monthly_reports_report_month_warehouse_key" ON "bnb_monthly_reports"("report_month", "warehouse");

-- CreateIndex
CREATE INDEX "bnb_lock_audits_report_month_warehouse_idx" ON "bnb_lock_audits"("report_month", "warehouse");

-- CreateIndex
CREATE INDEX "bnb_lock_audits_performed_at_idx" ON "bnb_lock_audits"("performed_at");

-- CreateIndex
CREATE UNIQUE INDEX "owner_companies_tax_id_key" ON "owner_companies"("tax_id");

-- CreateIndex
CREATE INDEX "owner_companies_is_active_idx" ON "owner_companies"("is_active");

-- CreateIndex
CREATE INDEX "owner_monthly_expenses_expense_month_idx" ON "owner_monthly_expenses"("expense_month");

-- CreateIndex
CREATE INDEX "owner_monthly_expenses_invoice_title_id_idx" ON "owner_monthly_expenses"("invoice_title_id");

-- CreateIndex
CREATE INDEX "owner_monthly_expenses_status_idx" ON "owner_monthly_expenses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "owner_monthly_expenses_expense_month_invoice_title_id_key" ON "owner_monthly_expenses"("expense_month", "invoice_title_id");

-- CreateIndex
CREATE INDEX "bnb_ota_commissions_commission_month_idx" ON "bnb_ota_commissions"("commission_month");

-- CreateIndex
CREATE INDEX "bnb_ota_commissions_ota_source_idx" ON "bnb_ota_commissions"("ota_source");

-- CreateIndex
CREATE INDEX "bnb_ota_commissions_payment_order_id_idx" ON "bnb_ota_commissions"("payment_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "bnb_ota_commissions_commission_month_ota_source_warehouse_key" ON "bnb_ota_commissions"("commission_month", "ota_source", "warehouse");

-- CreateIndex
CREATE INDEX "bnb_ota_reconcile_logs_reconcile_month_idx" ON "bnb_ota_reconcile_logs"("reconcile_month");

-- CreateIndex
CREATE INDEX "bnb_ota_reconcile_logs_ota_source_idx" ON "bnb_ota_reconcile_logs"("ota_source");

-- CreateIndex
CREATE INDEX "bnb_ota_reconcile_logs_created_at_idx" ON "bnb_ota_reconcile_logs"("created_at");

-- CreateIndex
CREATE INDEX "bnb_sync_failures_booking_id_idx" ON "bnb_sync_failures"("booking_id");

-- CreateIndex
CREATE INDEX "bnb_sync_failures_resolved_idx" ON "bnb_sync_failures"("resolved");

-- CreateIndex
CREATE INDEX "vendor_itinerary_billings_warehouse_idx" ON "vendor_itinerary_billings"("warehouse");

-- CreateIndex
CREATE INDEX "vendor_itinerary_billings_billing_month_idx" ON "vendor_itinerary_billings"("billing_month");

-- CreateIndex
CREATE INDEX "vendor_itinerary_billings_status_idx" ON "vendor_itinerary_billings"("status");

-- CreateIndex
CREATE INDEX "vendor_itinerary_billings_supplier_id_idx" ON "vendor_itinerary_billings"("supplier_id");

-- CreateIndex
CREATE INDEX "vendor_itinerary_items_billing_id_idx" ON "vendor_itinerary_items"("billing_id");

-- CreateIndex
CREATE INDEX "pms_reservation_records_warehouse_idx" ON "pms_reservation_records"("warehouse");

-- CreateIndex
CREATE INDEX "pms_reservation_records_business_date_idx" ON "pms_reservation_records"("business_date");

-- CreateIndex
CREATE INDEX "pms_reservation_records_batch_id_idx" ON "pms_reservation_records"("batch_id");

-- CreateIndex
CREATE INDEX "pms_reservation_records_source_idx" ON "pms_reservation_records"("source");

-- CreateIndex
CREATE INDEX "pms_reservation_records_vendor_billing_id_idx" ON "pms_reservation_records"("vendor_billing_id");

-- CreateIndex
CREATE INDEX "pms_reservation_cash_links_cash_transaction_id_idx" ON "pms_reservation_cash_links"("cash_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "pms_reservation_cash_links_reservation_id_cash_transaction__key" ON "pms_reservation_cash_links"("reservation_id", "cash_transaction_id");

-- CreateIndex
CREATE INDEX "pms_ota_recon_logs_warehouse_idx" ON "pms_ota_recon_logs"("warehouse");

-- CreateIndex
CREATE INDEX "pms_ota_recon_logs_billing_month_idx" ON "pms_ota_recon_logs"("billing_month");

-- CreateIndex
CREATE INDEX "pms_ota_recon_lines_recon_log_id_idx" ON "pms_ota_recon_lines"("recon_log_id");

-- CreateIndex
CREATE INDEX "pms_ota_recon_lines_reservation_id_idx" ON "pms_ota_recon_lines"("reservation_id");

-- CreateIndex
CREATE INDEX "bank_statements_account_id_idx" ON "bank_statements"("account_id");

-- CreateIndex
CREATE INDEX "bank_statements_year_month_idx" ON "bank_statements"("year_month");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statements_account_id_year_month_key" ON "bank_statements"("account_id", "year_month");

-- CreateIndex
CREATE INDEX "bank_recon_lines_bank_statement_id_idx" ON "bank_recon_lines"("bank_statement_id");

-- CreateIndex
CREATE INDEX "bank_recon_lines_tx_date_idx" ON "bank_recon_lines"("tx_date");

-- CreateIndex
CREATE INDEX "bank_recon_lines_match_status_idx" ON "bank_recon_lines"("match_status");

-- CreateIndex
CREATE INDEX "pms_month_closes_warehouse_idx" ON "pms_month_closes"("warehouse");

-- CreateIndex
CREATE INDEX "pms_month_closes_year_month_idx" ON "pms_month_closes"("year_month");

-- CreateIndex
CREATE UNIQUE INDEX "pms_month_closes_warehouse_year_month_key" ON "pms_month_closes"("warehouse", "year_month");

-- CreateIndex
CREATE INDEX "pms_ota_payments_warehouse_idx" ON "pms_ota_payments"("warehouse");

-- CreateIndex
CREATE INDEX "pms_ota_payments_year_month_idx" ON "pms_ota_payments"("year_month");

-- CreateIndex
CREATE UNIQUE INDEX "pms_ota_payments_warehouse_year_month_source_key" ON "pms_ota_payments"("warehouse", "year_month", "source");

-- CreateIndex
CREATE INDEX "backup_records_status_idx" ON "backup_records"("status");

-- CreateIndex
CREATE INDEX "backup_records_tier_idx" ON "backup_records"("tier");

-- CreateIndex
CREATE INDEX "backup_records_created_at_idx" ON "backup_records"("created_at");

-- CreateIndex
CREATE INDEX "backup_verifications_backup_id_idx" ON "backup_verifications"("backup_id");

-- CreateIndex
CREATE INDEX "company_expenses_expense_date_idx" ON "company_expenses"("expense_date");

-- CreateIndex
CREATE INDEX "company_expenses_period_idx" ON "company_expenses"("period");

-- CreateIndex
CREATE INDEX "company_input_invoices_invoice_date_idx" ON "company_input_invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "company_input_invoices_project_id_idx" ON "company_input_invoices"("project_id");

-- CreateIndex
CREATE INDEX "company_input_invoices_period_idx" ON "company_input_invoices"("period");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_contracts" ADD CONSTRAINT "supplier_contracts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_masters" ADD CONSTRAINT "purchase_masters_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_details" ADD CONSTRAINT "purchase_details_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_details" ADD CONSTRAINT "purchase_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_details" ADD CONSTRAINT "sales_details_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "sales_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_comparisons" ADD CONSTRAINT "price_comparisons_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_comparisons" ADD CONSTRAINT "price_comparisons_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_summary_caches" ADD CONSTRAINT "price_summary_caches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_summary_caches" ADD CONSTRAINT "price_summary_caches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_categories" ADD CONSTRAINT "cash_categories_accounting_subject_id_fkey" FOREIGN KEY ("accounting_subject_id") REFERENCES "accounting_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "cash_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_transfer_account_id_fkey" FOREIGN KEY ("transfer_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_channels" ADD CONSTRAINT "user_notification_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_income_records" ADD CONSTRAINT "pms_income_records_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "pms_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_masters" ADD CONSTRAINT "loan_masters_deduct_account_id_fkey" FOREIGN KEY ("deduct_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_rate_histories" ADD CONSTRAINT "loan_rate_histories_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loan_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_monthly_records" ADD CONSTRAINT "loan_monthly_records_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loan_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_notes" ADD CONSTRAINT "loan_notes_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loan_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_destination_account_id_fkey" FOREIGN KEY ("destination_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_reissue_of_check_id_fkey" FOREIGN KEY ("reissue_of_check_id") REFERENCES "checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "month_end_reports" ADD CONSTRAINT "month_end_reports_month_end_id_fkey" FOREIGN KEY ("month_end_id") REFERENCES "month_end_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_monthly_snapshots" ADD CONSTRAINT "account_monthly_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_monthly_snapshots" ADD CONSTRAINT "inventory_monthly_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_low_stock_caches" ADD CONSTRAINT "inventory_low_stock_caches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "inventory_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "inventory_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "inventory_transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_properties" ADD CONSTRAINT "rental_properties_rent_collect_account_id_fkey" FOREIGN KEY ("rent_collect_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_properties" ADD CONSTRAINT "rental_properties_deposit_account_id_fkey" FOREIGN KEY ("deposit_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_rental_property_id_fkey" FOREIGN KEY ("rental_property_id") REFERENCES "rental_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_annual_rent_filings" ADD CONSTRAINT "rental_annual_rent_filings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "rental_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_annual_rent_filings" ADD CONSTRAINT "rental_annual_rent_filings_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "rental_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_utility_incomes" ADD CONSTRAINT "rental_utility_incomes_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "rental_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "rental_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_previous_contract_id_fkey" FOREIGN KEY ("previous_contract_id") REFERENCES "rental_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reminders" ADD CONSTRAINT "contract_reminders_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "rental_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_incomes" ADD CONSTRAINT "rental_incomes_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "rental_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_incomes" ADD CONSTRAINT "rental_incomes_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "rental_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_incomes" ADD CONSTRAINT "rental_incomes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_income_payments" ADD CONSTRAINT "rental_income_payments_rental_income_id_fkey" FOREIGN KEY ("rental_income_id") REFERENCES "rental_incomes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_income_payments" ADD CONSTRAINT "rental_income_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_taxes" ADD CONSTRAINT "property_taxes_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "rental_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_maintenances" ADD CONSTRAINT "rental_maintenances_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "rental_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_bank_format_id_fkey" FOREIGN KEY ("bank_format_id") REFERENCES "bank_account_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "bank_statement_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "bank_statement_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_merchant_configs" ADD CONSTRAINT "credit_card_merchant_configs_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_batch_lines" ADD CONSTRAINT "credit_card_batch_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "credit_card_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_fee_details" ADD CONSTRAINT "credit_card_fee_details_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "credit_card_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_executions" ADD CONSTRAINT "cashier_executions_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_expense_templates" ADD CONSTRAINT "common_expense_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_entry_lines" ADD CONSTRAINT "template_entry_lines_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "common_expense_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_expense_records" ADD CONSTRAINT "common_expense_records_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "common_expense_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_entry_lines" ADD CONSTRAINT "record_entry_lines_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "common_expense_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_count_configs" ADD CONSTRAINT "cash_count_configs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_count_details" ADD CONSTRAINT "cash_count_details_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "cash_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_end_inventories" ADD CONSTRAINT "year_end_inventories_year_end_id_fkey" FOREIGN KEY ("year_end_id") REFERENCES "year_end_rollovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_end_balance_records" ADD CONSTRAINT "year_end_balance_records_year_end_id_fkey" FOREIGN KEY ("year_end_id") REFERENCES "year_end_rollovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_end_financial_statements" ADD CONSTRAINT "year_end_financial_statements_year_end_id_fkey" FOREIGN KEY ("year_end_id") REFERENCES "year_end_rollovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "import_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_logs" ADD CONSTRAINT "import_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction_suggestions" ADD CONSTRAINT "bank_transaction_suggestions_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_snapshots" ADD CONSTRAINT "audit_snapshots_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "audit_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_operation_records" ADD CONSTRAINT "critical_operation_records_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "audit_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_projects" ADD CONSTRAINT "engineering_projects_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_projects" ADD CONSTRAINT "engineering_projects_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_contracts" ADD CONSTRAINT "engineering_contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "engineering_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_contracts" ADD CONSTRAINT "engineering_contracts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_contract_terms" ADD CONSTRAINT "engineering_contract_terms_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "engineering_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_materials" ADD CONSTRAINT "engineering_materials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "engineering_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_materials" ADD CONSTRAINT "engineering_materials_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "engineering_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_materials" ADD CONSTRAINT "engineering_materials_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "engineering_contract_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_materials" ADD CONSTRAINT "engineering_materials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_incomes" ADD CONSTRAINT "engineering_incomes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "engineering_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_incomes" ADD CONSTRAINT "engineering_incomes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_input_invoices" ADD CONSTRAINT "engineering_input_invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "engineering_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_input_invoices" ADD CONSTRAINT "engineering_input_invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "engineering_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_output_invoices" ADD CONSTRAINT "engineering_output_invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "engineering_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowance_details" ADD CONSTRAINT "allowance_details_allowance_id_fkey" FOREIGN KEY ("allowance_id") REFERENCES "purchase_allowances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_monthly_expenses" ADD CONSTRAINT "owner_monthly_expenses_invoice_title_id_fkey" FOREIGN KEY ("invoice_title_id") REFERENCES "invoice_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnb_sync_failures" ADD CONSTRAINT "bnb_sync_failures_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bnb_booking_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_itinerary_billings" ADD CONSTRAINT "vendor_itinerary_billings_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_itinerary_billings" ADD CONSTRAINT "vendor_itinerary_billings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_itinerary_items" ADD CONSTRAINT "vendor_itinerary_items_billing_id_fkey" FOREIGN KEY ("billing_id") REFERENCES "vendor_itinerary_billings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_reservation_records" ADD CONSTRAINT "pms_reservation_records_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "pms_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_reservation_records" ADD CONSTRAINT "pms_reservation_records_vendor_billing_id_fkey" FOREIGN KEY ("vendor_billing_id") REFERENCES "vendor_itinerary_billings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_reservation_cash_links" ADD CONSTRAINT "pms_reservation_cash_links_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "pms_reservation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_ota_recon_lines" ADD CONSTRAINT "pms_ota_recon_lines_recon_log_id_fkey" FOREIGN KEY ("recon_log_id") REFERENCES "pms_ota_recon_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_ota_recon_lines" ADD CONSTRAINT "pms_ota_recon_lines_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "pms_reservation_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_recon_lines" ADD CONSTRAINT "bank_recon_lines_bank_statement_id_fkey" FOREIGN KEY ("bank_statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_input_invoices" ADD CONSTRAINT "company_input_invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "engineering_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;


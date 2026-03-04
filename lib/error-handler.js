// spec22 - Unified Error Handler
import { NextResponse } from 'next/server';

export function createErrorResponse(code, message, httpStatus = 400, details = null) {
  const body = {
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    },
  };
  return NextResponse.json(body, { status: httpStatus });
}

export const ErrorCodes = {
  // 通用
  VALIDATION_FAILED: { code: 'VALIDATION_FAILED', status: 400 },
  REQUIRED_FIELD_MISSING: { code: 'REQUIRED_FIELD_MISSING', status: 400 },
  UNAUTHORIZED: { code: 'UNAUTHORIZED', status: 401 },
  FORBIDDEN: { code: 'FORBIDDEN', status: 403 },
  FORBIDDEN_SYSTEM_DEFAULT: { code: 'FORBIDDEN_SYSTEM_DEFAULT', status: 403 },
  NOT_FOUND: { code: 'NOT_FOUND', status: 404 },
  CONFLICT_UNIQUE: { code: 'CONFLICT_UNIQUE', status: 409 },
  PERIOD_LOCKED: { code: 'PERIOD_LOCKED', status: 423 },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500 },

  // 進銷存
  PURCHASE_ITEM_INVOICED: { code: 'PURCHASE_ITEM_INVOICED', status: 400 },
  INVOICE_DUPLICATE: { code: 'INVOICE_DUPLICATE', status: 409 },

  // 財務/出納
  PAYMENT_ORDER_INVOICE_LOCKED: { code: 'PAYMENT_ORDER_INVOICE_LOCKED', status: 400 },

  // 貸款/支票
  LOAN_ACCOUNT_NOT_FOUND: { code: 'LOAN_ACCOUNT_NOT_FOUND', status: 400 },
  LOAN_RECORD_ALREADY_CONFIRMED: { code: 'LOAN_RECORD_ALREADY_CONFIRMED', status: 400 },
  CHECK_ALREADY_CLEARED: { code: 'CHECK_ALREADY_CLEARED', status: 400 },
  CHECK_NUMBER_DUPLICATE: { code: 'CHECK_NUMBER_DUPLICATE', status: 409 },

  // 現金流
  TRANSACTION_CONFIRMED_IMMUTABLE: { code: 'TRANSACTION_CONFIRMED_IMMUTABLE', status: 403 },
  ACCOUNT_HAS_DEPENDENCIES: { code: 'ACCOUNT_HAS_DEPENDENCIES', status: 400 },

  // 月結/年結
  MONTH_END_INCOMPLETE: { code: 'MONTH_END_INCOMPLETE', status: 400 },
  YEAR_END_INCOMPLETE: { code: 'YEAR_END_INCOMPLETE', status: 400 },
  YEAR_END_ALREADY_EXISTS: { code: 'YEAR_END_ALREADY_EXISTS', status: 409 },
  YEAR_END_MONTHS_NOT_LOCKED: { code: 'YEAR_END_MONTHS_NOT_LOCKED', status: 400 },

  // PMS
  PMS_DUPLICATE_IMPORT: { code: 'PMS_DUPLICATE_IMPORT', status: 409 },
  PMS_PARSE_ERROR: { code: 'PMS_PARSE_ERROR', status: 400 },

  // 租屋
  RENTAL_INCOME_CONFIRMED: { code: 'RENTAL_INCOME_CONFIRMED', status: 400 },
  TRANSFER_REF_DUPLICATE: { code: 'TRANSFER_REF_DUPLICATE', status: 409 },
  PROPERTY_ALREADY_RENTED: { code: 'PROPERTY_ALREADY_RENTED', status: 409 },

  // 主資料
  SUPPLIER_NAME_DUPLICATE: { code: 'SUPPLIER_NAME_DUPLICATE', status: 409 },
  PRODUCT_CODE_DUPLICATE: { code: 'PRODUCT_CODE_DUPLICATE', status: 409 },
  WAREHOUSE_NAME_DUPLICATE: { code: 'WAREHOUSE_NAME_DUPLICATE', status: 409 },

  // 現金盤點 (spec26)
  CASH_COUNT_ALREADY_SUBMITTED: { code: 'CASH_COUNT_ALREADY_SUBMITTED', status: 400 },
  CASH_COUNT_ALREADY_REVIEWED: { code: 'CASH_COUNT_ALREADY_REVIEWED', status: 400 },
  CASH_COUNT_SHORTAGE_EXCEED: { code: 'CASH_COUNT_SHORTAGE_EXCEED', status: 400 },

  // 對帳 (spec17 v3)
  RECONCILIATION_ALREADY_MATCHED: { code: 'RECONCILIATION_ALREADY_MATCHED', status: 400 },
  RECONCILIATION_AMOUNT_MISMATCH: { code: 'RECONCILIATION_AMOUNT_MISMATCH', status: 400 },
  BANK_STATEMENT_PARSE_ERROR: { code: 'BANK_STATEMENT_PARSE_ERROR', status: 400 },
  CREDIT_CARD_STATEMENT_PARSE_ERROR: { code: 'CREDIT_CARD_STATEMENT_PARSE_ERROR', status: 400 },

  // 備份 (spec27)
  BACKUP_IN_PROGRESS: { code: 'BACKUP_IN_PROGRESS', status: 409 },
  BACKUP_NOT_FOUND: { code: 'BACKUP_NOT_FOUND', status: 404 },
  BACKUP_RESTORE_FAILED: { code: 'BACKUP_RESTORE_FAILED', status: 500 },

  // 資料匯入 (spec25)
  IMPORT_FILE_INVALID: { code: 'IMPORT_FILE_INVALID', status: 400 },
  IMPORT_DATA_VALIDATION_FAILED: { code: 'IMPORT_DATA_VALIDATION_FAILED', status: 400 },
  IMPORT_DUPLICATE_DETECTED: { code: 'IMPORT_DUPLICATE_DETECTED', status: 409 },

  // 通知 (spec28)
  NOTIFICATION_CHANNEL_INVALID: { code: 'NOTIFICATION_CHANNEL_INVALID', status: 400 },
  LINE_BINDING_EXPIRED: { code: 'LINE_BINDING_EXPIRED', status: 400 },
  LINE_ALREADY_BOUND: { code: 'LINE_ALREADY_BOUND', status: 409 },
  SMTP_CONFIG_INVALID: { code: 'SMTP_CONFIG_INVALID', status: 400 },
};

export function handleApiError(error) {
  console.error('API Error:', error);
  return createErrorResponse(
    'INTERNAL_ERROR',
    '系統發生錯誤，請稍後再試',
    500,
    process.env.NODE_ENV === 'development' ? { message: error.message } : null
  );
}

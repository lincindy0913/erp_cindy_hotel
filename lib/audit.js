// spec18 v3 - 稽核日誌工具

export const AUDIT_ACTIONS = {
  // 財務出納
  PAYMENT_ORDER_CREATE: 'payment_order.create',
  PAYMENT_ORDER_UPDATE: 'payment_order.update',
  PAYMENT_ORDER_VOID: 'payment_order.void',
  CASHIER_EXECUTE: 'cashier.execute',
  CASHIER_VOID: 'cashier.void',
  CASHIER_REJECT: 'cashier.reject',
  // 現金流
  CASH_TRANSACTION_CREATE: 'cash_transaction.create',
  CASH_TRANSACTION_UPDATE: 'cash_transaction.update',
  CASH_TRANSACTION_REVERSE: 'cash_transaction.reverse',
  CASH_ACCOUNT_CREATE: 'cash_account.create',
  CASH_ACCOUNT_UPDATE: 'cash_account.update',
  CASH_ACCOUNT_DELETE: 'cash_account.delete',
  // 支票
  CHECK_CREATE: 'check.create',
  CHECK_CLEAR: 'check.clear',
  CHECK_VOID: 'check.void',
  CHECK_BOUNCE: 'check.bounce',
  // 貸款
  LOAN_CREATE: 'loan.create',
  LOAN_UPDATE: 'loan.update',
  LOAN_DELETE: 'loan.delete',
  LOAN_RECORD_CONFIRM: 'loan_record.confirm',
  LOAN_RECORD_DELETE: 'loan_record.delete',
  // 資產
  ASSET_CREATE: 'asset.create',
  ASSET_UPDATE: 'asset.update',
  ASSET_DELETE: 'asset.delete',
  // 月結
  MONTH_END_CLOSE: 'month_end.close',
  MONTH_END_UNLOCK: 'month_end.unlock',
  // 年結
  YEAR_END_CLOSE: 'year_end.close',
  YEAR_END_UNLOCK: 'year_end.unlock',
  // 系統設定
  SYSTEM_CONFIG_UPDATE: 'system_config.update',
  // 使用者
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DEACTIVATE: 'user.deactivate',
  USER_ROLE_ASSIGN: 'user_role.assign',
  USER_ROLE_REMOVE: 'user_role.remove',
  // 認證
  LOGIN_SUCCESS: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  // 附件
  ATTACHMENT_UPLOAD: 'attachment.upload',
  ATTACHMENT_DELETE: 'attachment.delete',
  // 嘗試（拒絕存取）
  ATTEMPT_UNAUTHORIZED: 'attempt.unauthorized',
  ATTEMPT_DELETE_CONFIRMED: 'attempt.delete_confirmed',
  ATTEMPT_MODIFY_LOCKED: 'attempt.modify_locked',
  // 現金盤點 (spec26)
  CASH_COUNT_CREATE: 'cash_count.create',
  CASH_COUNT_SUBMIT: 'cash_count.submit',
  CASH_COUNT_REVIEW: 'cash_count.review',
  CASH_COUNT_APPROVE: 'cash_count.approve',
  CASH_COUNT_REJECT: 'cash_count.reject',
  // 對帳 (spec17 v3)
  RECONCILIATION_MATCH: 'reconciliation.match',
  RECONCILIATION_UNMATCH: 'reconciliation.unmatch',
  RECONCILIATION_AUTO_CREATE: 'reconciliation.auto_create',
  RECONCILIATION_IMPORT: 'reconciliation.import',
  // 備份 (spec27)
  BACKUP_CREATE: 'backup.create',
  BACKUP_RESTORE: 'backup.restore',
  BACKUP_DELETE: 'backup.delete',
  // 匯入 (spec25)
  DATA_IMPORT: 'data.import',
  DATA_IMPORT_ROLLBACK: 'data.import_rollback',
  // 通知 (spec28)
  NOTIFICATION_CONFIG_UPDATE: 'notification_config.update',
  LINE_BINDING: 'line.binding',
  LINE_UNBINDING: 'line.unbinding',
  // 租屋
  RENTAL_CONTRACT_CREATE: 'rental_contract.create',
  RENTAL_CONTRACT_UPDATE: 'rental_contract.update',
  RENTAL_INCOME_CONFIRM: 'rental_income.confirm',
  RENTAL_INCOME_VOID: 'rental_income.void',
  // 進貨
  SUPPLIER_UPDATE: 'supplier.update',
  PRODUCT_UPDATE: 'product.update',
  PURCHASE_CREATE: 'purchase.create',
  PURCHASE_UPDATE: 'purchase.update',
  PURCHASE_VOID: 'purchase.void',
  // 發票
  INVOICE_CREATE: 'invoice.create',
  INVOICE_UPDATE: 'invoice.update',
  INVOICE_VOID: 'invoice.void',
  // 費用
  EXPENSE_CREATE: 'expense.create',
  EXPENSE_UPDATE: 'expense.update',
  EXPENSE_VOID: 'expense.void',
  // PMS
  PMS_IMPORT: 'pms.import',
  PMS_VOID: 'pms.void',
  // 匯出
  EXPORT_EXECUTE: 'export.execute',
  DATA_EXPORT: 'data.export',
  // 補充缺少的 actions
  CHECK_REISSUE: 'check.reissue',
  CHECK_DELETE: 'check.delete',
  EXPENSE_CONFIRM: 'expense.confirm',
  EXPENSE_DELETE: 'expense.delete',
  RENTAL_CONTRACT_DELETE: 'rental_contract.delete',
  RENTAL_INCOME_UPDATE: 'rental_income.update',
  RENTAL_INCOME_DELETE: 'rental_income.delete',
  LOAN_RECORD_CREATE: 'loan_record.create',
  LOAN_AUTO_PUSH: 'loan.auto_push',
  PURCHASE_DELETE: 'purchase.delete',
  PAYMENT_ORDER_DELETE: 'payment_order.delete',
  CASH_COUNT_CONFIRM: 'cash_count.confirm',
  CASH_COUNT_UNLOCK: 'cash_count.unlock',
  RECONCILIATION_ADJUST: 'reconciliation.adjust',
  CASH_TRANSACTION_DELETE: 'cash_transaction.delete',
};

export const AUDIT_LEVELS = {
  FINANCE: 'finance',
  ADMIN: 'admin',
  OPERATION: 'operation',
  ATTEMPT: 'attempt',
};

// action → level 對應
const ACTION_LEVEL_MAP = {
  [AUDIT_ACTIONS.CASHIER_EXECUTE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.CASHIER_VOID]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.CASH_TRANSACTION_REVERSE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.CHECK_CLEAR]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.CHECK_BOUNCE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.LOAN_RECORD_CONFIRM]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.MONTH_END_CLOSE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.MONTH_END_UNLOCK]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.YEAR_END_CLOSE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.YEAR_END_UNLOCK]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.CASH_COUNT_APPROVE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.CASH_COUNT_REJECT]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.RECONCILIATION_AUTO_CREATE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.RENTAL_INCOME_CONFIRM]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.RENTAL_INCOME_VOID]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.USER_CREATE]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.USER_UPDATE]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.USER_DEACTIVATE]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.USER_ROLE_ASSIGN]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.USER_ROLE_REMOVE]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.SYSTEM_CONFIG_UPDATE]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.BACKUP_CREATE]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.BACKUP_RESTORE]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.BACKUP_DELETE]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.NOTIFICATION_CONFIG_UPDATE]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.DATA_IMPORT]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.DATA_IMPORT_ROLLBACK]: AUDIT_LEVELS.ADMIN,
  [AUDIT_ACTIONS.ATTEMPT_UNAUTHORIZED]: AUDIT_LEVELS.ATTEMPT,
  [AUDIT_ACTIONS.ATTEMPT_DELETE_CONFIRMED]: AUDIT_LEVELS.ATTEMPT,
  [AUDIT_ACTIONS.ATTEMPT_MODIFY_LOCKED]: AUDIT_LEVELS.ATTEMPT,
  [AUDIT_ACTIONS.CHECK_REISSUE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.CHECK_DELETE]: AUDIT_LEVELS.OPERATION,
  [AUDIT_ACTIONS.EXPENSE_CONFIRM]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.EXPENSE_DELETE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.RENTAL_INCOME_DELETE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.LOAN_AUTO_PUSH]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.LOAN_RECORD_CREATE]: AUDIT_LEVELS.OPERATION,
  [AUDIT_ACTIONS.CASH_COUNT_CONFIRM]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.CASH_COUNT_UNLOCK]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.RECONCILIATION_ADJUST]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.CASH_TRANSACTION_DELETE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.PAYMENT_ORDER_DELETE]: AUDIT_LEVELS.FINANCE,
  [AUDIT_ACTIONS.LOAN_UPDATE]: AUDIT_LEVELS.OPERATION,
  [AUDIT_ACTIONS.LOAN_DELETE]: AUDIT_LEVELS.OPERATION,
  [AUDIT_ACTIONS.ASSET_CREATE]: AUDIT_LEVELS.OPERATION,
  [AUDIT_ACTIONS.ASSET_UPDATE]: AUDIT_LEVELS.OPERATION,
  [AUDIT_ACTIONS.ASSET_DELETE]: AUDIT_LEVELS.OPERATION,
  [AUDIT_ACTIONS.CASH_ACCOUNT_DELETE]: AUDIT_LEVELS.OPERATION,
  [AUDIT_ACTIONS.SUPPLIER_UPDATE]: AUDIT_LEVELS.OPERATION,
  [AUDIT_ACTIONS.PRODUCT_UPDATE]: AUDIT_LEVELS.OPERATION,
};

// action 中文名稱
export const AUDIT_ACTION_LABELS = {
  [AUDIT_ACTIONS.PAYMENT_ORDER_CREATE]: '建立付款單',
  [AUDIT_ACTIONS.PAYMENT_ORDER_UPDATE]: '修改付款單',
  [AUDIT_ACTIONS.PAYMENT_ORDER_VOID]: '作廢付款單',
  [AUDIT_ACTIONS.CASHIER_EXECUTE]: '出納確認執行',
  [AUDIT_ACTIONS.CASHIER_VOID]: '出納作廢',
  [AUDIT_ACTIONS.CASHIER_REJECT]: '出納退回',
  [AUDIT_ACTIONS.CASH_TRANSACTION_CREATE]: '建立現金交易',
  [AUDIT_ACTIONS.CASH_TRANSACTION_UPDATE]: '修改現金交易',
  [AUDIT_ACTIONS.CASH_TRANSACTION_REVERSE]: '沖銷現金交易',
  [AUDIT_ACTIONS.CASH_ACCOUNT_CREATE]: '建立現金帳戶',
  [AUDIT_ACTIONS.CASH_ACCOUNT_UPDATE]: '修改現金帳戶',
  [AUDIT_ACTIONS.CHECK_CREATE]: '建立支票',
  [AUDIT_ACTIONS.CHECK_CLEAR]: '支票兌現',
  [AUDIT_ACTIONS.CHECK_VOID]: '支票作廢',
  [AUDIT_ACTIONS.CHECK_BOUNCE]: '支票退票',
  [AUDIT_ACTIONS.LOAN_CREATE]: '建立貸款',
  [AUDIT_ACTIONS.LOAN_RECORD_CONFIRM]: '貸款核實',
  [AUDIT_ACTIONS.LOAN_RECORD_DELETE]: '刪除貸款記錄',
  [AUDIT_ACTIONS.MONTH_END_CLOSE]: '月結關帳',
  [AUDIT_ACTIONS.MONTH_END_UNLOCK]: '月結解鎖',
  [AUDIT_ACTIONS.YEAR_END_CLOSE]: '年結關帳',
  [AUDIT_ACTIONS.YEAR_END_UNLOCK]: '年結解鎖',
  [AUDIT_ACTIONS.SYSTEM_CONFIG_UPDATE]: '系統設定修改',
  [AUDIT_ACTIONS.USER_CREATE]: '建立使用者',
  [AUDIT_ACTIONS.USER_UPDATE]: '修改使用者',
  [AUDIT_ACTIONS.USER_DEACTIVATE]: '停用使用者',
  [AUDIT_ACTIONS.USER_ROLE_ASSIGN]: '指派角色',
  [AUDIT_ACTIONS.USER_ROLE_REMOVE]: '移除角色',
  [AUDIT_ACTIONS.LOGIN_SUCCESS]: '登入成功',
  [AUDIT_ACTIONS.LOGIN_FAILED]: '登入失敗',
  [AUDIT_ACTIONS.ATTACHMENT_UPLOAD]: '上傳附件',
  [AUDIT_ACTIONS.ATTACHMENT_DELETE]: '刪除附件',
  [AUDIT_ACTIONS.ATTEMPT_UNAUTHORIZED]: '未授權存取',
  [AUDIT_ACTIONS.ATTEMPT_DELETE_CONFIRMED]: '嘗試刪除已確認記錄',
  [AUDIT_ACTIONS.ATTEMPT_MODIFY_LOCKED]: '嘗試修改已鎖定期間',
  [AUDIT_ACTIONS.CASH_COUNT_CREATE]: '建立現金盤點',
  [AUDIT_ACTIONS.CASH_COUNT_SUBMIT]: '提交現金盤點',
  [AUDIT_ACTIONS.CASH_COUNT_REVIEW]: '覆核現金盤點',
  [AUDIT_ACTIONS.CASH_COUNT_APPROVE]: '核准現金盤點',
  [AUDIT_ACTIONS.CASH_COUNT_REJECT]: '退回現金盤點',
  [AUDIT_ACTIONS.RECONCILIATION_MATCH]: '對帳配對',
  [AUDIT_ACTIONS.RECONCILIATION_UNMATCH]: '對帳取消配對',
  [AUDIT_ACTIONS.RECONCILIATION_AUTO_CREATE]: '對帳自動建立交易',
  [AUDIT_ACTIONS.RECONCILIATION_IMPORT]: '匯入銀行對帳單',
  [AUDIT_ACTIONS.BACKUP_CREATE]: '建立備份',
  [AUDIT_ACTIONS.BACKUP_RESTORE]: '還原備份',
  [AUDIT_ACTIONS.BACKUP_DELETE]: '刪除備份',
  [AUDIT_ACTIONS.DATA_IMPORT]: '資料匯入',
  [AUDIT_ACTIONS.DATA_IMPORT_ROLLBACK]: '資料匯入回滾',
  [AUDIT_ACTIONS.NOTIFICATION_CONFIG_UPDATE]: '通知設定修改',
  [AUDIT_ACTIONS.LINE_BINDING]: 'LINE 綁定',
  [AUDIT_ACTIONS.LINE_UNBINDING]: 'LINE 解除綁定',
  [AUDIT_ACTIONS.RENTAL_CONTRACT_CREATE]: '建立租約',
  [AUDIT_ACTIONS.RENTAL_CONTRACT_UPDATE]: '修改租約',
  [AUDIT_ACTIONS.RENTAL_INCOME_CONFIRM]: '租金收入確認',
  [AUDIT_ACTIONS.RENTAL_INCOME_VOID]: '租金收入作廢',
  [AUDIT_ACTIONS.PURCHASE_CREATE]: '建立進貨單',
  [AUDIT_ACTIONS.PURCHASE_UPDATE]: '修改進貨單',
  [AUDIT_ACTIONS.PURCHASE_VOID]: '作廢進貨單',
  [AUDIT_ACTIONS.INVOICE_CREATE]: '建立發票',
  [AUDIT_ACTIONS.INVOICE_UPDATE]: '修改發票',
  [AUDIT_ACTIONS.INVOICE_VOID]: '作廢發票',
  [AUDIT_ACTIONS.EXPENSE_CREATE]: '建立費用',
  [AUDIT_ACTIONS.EXPENSE_UPDATE]: '修改費用',
  [AUDIT_ACTIONS.EXPENSE_VOID]: '作廢費用',
  [AUDIT_ACTIONS.PMS_IMPORT]: 'PMS 匯入',
  [AUDIT_ACTIONS.PMS_VOID]: 'PMS 作廢',
  [AUDIT_ACTIONS.EXPORT_EXECUTE]: '匯出報表',
  [AUDIT_ACTIONS.CHECK_REISSUE]: '支票重新開票',
  [AUDIT_ACTIONS.CHECK_DELETE]: '刪除支票',
  [AUDIT_ACTIONS.EXPENSE_CONFIRM]: '費用確認',
  [AUDIT_ACTIONS.EXPENSE_DELETE]: '刪除費用',
  [AUDIT_ACTIONS.RENTAL_CONTRACT_DELETE]: '刪除租約',
  [AUDIT_ACTIONS.RENTAL_INCOME_UPDATE]: '修改租金收入',
  [AUDIT_ACTIONS.RENTAL_INCOME_DELETE]: '作廢租金收入',
  [AUDIT_ACTIONS.LOAN_RECORD_CREATE]: '建立還款記錄',
  [AUDIT_ACTIONS.LOAN_AUTO_PUSH]: '自動推送還款至出納',
  [AUDIT_ACTIONS.PURCHASE_DELETE]: '刪除進貨單',
  [AUDIT_ACTIONS.PAYMENT_ORDER_DELETE]: '刪除付款單',
  [AUDIT_ACTIONS.CASH_COUNT_CONFIRM]: '確認現金盤點',
  [AUDIT_ACTIONS.CASH_COUNT_UNLOCK]: '解鎖現金盤點',
  [AUDIT_ACTIONS.RECONCILIATION_ADJUST]: '對帳調整',
  [AUDIT_ACTIONS.CASH_TRANSACTION_DELETE]: '刪除現金交易',
  [AUDIT_ACTIONS.LOAN_UPDATE]: '修改貸款',
  [AUDIT_ACTIONS.LOAN_DELETE]: '刪除貸款',
  [AUDIT_ACTIONS.ASSET_CREATE]: '建立資產',
  [AUDIT_ACTIONS.ASSET_UPDATE]: '修改資產',
  [AUDIT_ACTIONS.ASSET_DELETE]: '刪除資產',
  [AUDIT_ACTIONS.CASH_ACCOUNT_DELETE]: '刪除現金帳戶',
  [AUDIT_ACTIONS.SUPPLIER_UPDATE]: '修改廠商',
  [AUDIT_ACTIONS.PRODUCT_UPDATE]: '修改產品',
};

/**
 * 建立稽核日誌
 * @param {PrismaClient} prismaClient - Prisma client（可為 tx）
 * @param {Object} params
 */
export async function createAuditLog(prismaClient, {
  action,
  level,
  targetModule,
  targetRecordId,
  targetRecordNo,
  beforeState,
  afterState,
  note,
  userId,
  userEmail,
  userName,
  ipAddress,
}) {
  try {
    return await prismaClient.auditLog.create({
      data: {
        action,
        level: level || ACTION_LEVEL_MAP[action] || AUDIT_LEVELS.OPERATION,
        targetModule: targetModule || null,
        targetRecordId: targetRecordId ? parseInt(targetRecordId) : null,
        targetRecordNo: targetRecordNo || null,
        beforeState: beforeState || undefined,
        afterState: afterState || undefined,
        note: note || null,
        userId: userId ? parseInt(userId) : null,
        userEmail: userEmail || null,
        userName: userName || null,
        ipAddress: ipAddress || null,
      },
    });
  } catch (error) {
    // 稽核日誌寫入失敗不應影響主要操作，但須記錄以利追蹤
    console.error('建立稽核日誌失敗:', error.message || error);

    // Fire-and-forget: persist failure to ErrorAlertLog for compliance tracking
    try {
      // Use a separate import to avoid circular dependency issues
      const { default: db } = await import('@/lib/prisma');
      await db.errorAlertLog.create({
        data: {
          category: 'audit_log_failure',
          title: '稽核日誌寫入失敗',
          message: `action=${action}, module=${targetModule || '?'}, recordId=${targetRecordId || '?'}: ${error.message || 'unknown'}`,
          metadata: {
            action,
            targetModule,
            targetRecordId,
            userEmail,
            errorMessage: error.message,
          },
        },
      });
    } catch {
      // Last resort: if even ErrorAlertLog fails, only console.error remains
    }
    return null;
  }
}

/**
 * 從 session 提取使用者資訊並建立稽核日誌
 */
export async function auditFromSession(prismaClient, session, params) {
  return createAuditLog(prismaClient, {
    ...params,
    userId: session?.user?.id,
    userEmail: session?.user?.email,
    userName: session?.user?.name,
  });
}

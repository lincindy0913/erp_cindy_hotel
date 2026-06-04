/**
 * Check model status constants.
 * All status values are English enums stored in the database.
 *
 * Usage:
 *   import { CHECK_STATUS } from '@/lib/check-statuses';
 *   where: { status: CHECK_STATUS.PENDING }
 */
export const CHECK_STATUS = /** @type {const} */ ({
  PENDING:  'pending',   // 待兌現（未到期）
  DUE:      'due',       // 已到期（cron 自動更新 pending → due）
  CLEARED:  'cleared',   // 已兌現
  BOUNCED:  'bounced',   // 退票
  VOID:     'void',      // 作廢
  OVERDUE:  'overdue',   // 逾期未兌現（分析用）
});

/** 可以執行兌現操作的狀態 */
export const CHECK_CLEARABLE = [CHECK_STATUS.PENDING, CHECK_STATUS.DUE];

/** 已完結（不可再操作）的狀態 */
export const CHECK_TERMINAL = [CHECK_STATUS.CLEARED, CHECK_STATUS.BOUNCED, CHECK_STATUS.VOID];

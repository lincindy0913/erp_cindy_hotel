/**
 * RentalContract model status constants.
 * All status values are English enums stored in the database.
 *
 * Usage:
 *   import { CONTRACT_STATUS } from '@/lib/rental-contract-statuses';
 *   where: { status: CONTRACT_STATUS.ACTIVE }
 */
export const CONTRACT_STATUS = /** @type {const} */ ({
  ACTIVE:     'active',      // 有效合約
  PENDING:    'pending',     // 待生效（已簽但未到起租日）
  EXPIRED:    'expired',     // 到期（cron 自動更新 active → expired）
  TERMINATED: 'terminated',  // 提前終止
});

/** 佔用物業中的合約（用於空置率計算） */
export const CONTRACT_OCCUPYING = [CONTRACT_STATUS.ACTIVE, CONTRACT_STATUS.PENDING];

/** 已結束的合約 */
export const CONTRACT_ENDED = [CONTRACT_STATUS.EXPIRED, CONTRACT_STATUS.TERMINATED];

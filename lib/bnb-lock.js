/**
 * B&B month-level lock enforcement.
 *
 * 民宿帳鎖帳：當 BnbMonthlyReport.lockedAt 不為 null 時，
 * 該月＋館別的所有訂房紀錄與月報皆不可再修改。
 *
 * Usage:
 *   import { assertBnbMonthOpen, getBnbLockStatus } from '@/lib/bnb-lock';
 *
 *   // Inside an API route handler:
 *   const lock = await assertBnbMonthOpen('2026-03', '民宿');
 *   // throws → caller returns 423 Locked
 */
import prisma from '@/lib/prisma';

/**
 * @param {string} reportMonth  YYYY-MM
 * @param {string} warehouse    館別
 * @returns {{ lockedAt: Date, lockedBy: string } | null}
 */
export async function getBnbLockStatus(reportMonth, warehouse) {
  if (!reportMonth) return null;
  const report = await prisma.bnbMonthlyReport.findUnique({
    where: { reportMonth_warehouse: { reportMonth, warehouse: warehouse || '民宿' } },
    select: { lockedAt: true, lockedBy: true },
  });
  if (report?.lockedAt) return report;
  return null;
}

/**
 * Throws if the month is locked. Catch in route handler → return 423.
 */
export async function assertBnbMonthOpen(reportMonth, warehouse) {
  const lock = await getBnbLockStatus(reportMonth, warehouse);
  if (lock) {
    const err = new Error(
      `BNB_MONTH_LOCKED:${reportMonth}（${warehouse || '民宿'}）已鎖帳，無法修改。如需修改請先解鎖。`
    );
    err.statusCode = 423;
    throw err;
  }
}

/**
 * Period lock enforcement — prevents modifications to closed/locked accounting periods.
 *
 * Usage inside $transaction:
 *   await assertPeriodOpen(tx, '2024-03-15');
 *   await assertPeriodOpen(tx, '2024-03-15', '麗格');
 *
 * Throws PERIOD_LOCKED: error if the period is locked/closed.
 * The caller's error handler should catch and return 423 (Locked).
 */

/**
 * Extract year and month from a date string (YYYY-MM-DD or YYYYMMDD).
 */
function parsePeriod(dateStr) {
  if (!dateStr) return null;
  const cleaned = String(dateStr).replace(/-/g, '');
  if (cleaned.length < 6) return null;
  return {
    year: parseInt(cleaned.substring(0, 4)),
    month: parseInt(cleaned.substring(4, 6)),
  };
}

/**
 * Check if a given period is locked. Returns the lock status or null if open.
 * @param {object} db - Prisma client or transaction instance
 * @param {number} year
 * @param {number} month
 * @param {string|null} warehouse - optional warehouse filter
 */
async function getPeriodLockStatus(db, year, month, warehouse) {
  const where = {
    year,
    month,
    status: '已鎖定',
  };

  // Check warehouse-specific lock first, then global (warehouse=null)
  if (warehouse) {
    const warehouseLock = await db.monthEndStatus.findFirst({
      where: { ...where, warehouse },
    });
    if (warehouseLock) return warehouseLock;
  }

  // Check global lock (warehouse is null)
  const globalLock = await db.monthEndStatus.findFirst({
    where: { ...where, warehouse: null },
  });

  return globalLock || null;
}

/**
 * Assert that the accounting period for a given date is open (not locked).
 * Throws an error if the period is locked — use inside $transaction blocks.
 *
 * @param {object} db - Prisma client or transaction instance
 * @param {string} dateStr - Transaction date (YYYY-MM-DD)
 * @param {string|null} warehouse - Optional warehouse for warehouse-specific locks
 * @throws {Error} PERIOD_LOCKED: if the period is closed or locked
 */
export async function assertPeriodOpen(db, dateStr, warehouse) {
  const period = parsePeriod(dateStr);
  if (!period) return; // Cannot determine period — allow (defensive)

  const lock = await getPeriodLockStatus(db, period.year, period.month, warehouse || null);

  if (lock) {
    const whLabel = warehouse ? ` (${warehouse})` : '';
    throw new Error(
      `PERIOD_LOCKED:${period.year}年${period.month}月${whLabel}已${lock.status}，無法新增或修改交易。如需修改請先解鎖該月份。`
    );
  }
}

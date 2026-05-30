/**
 * 租屋年度結算鎖定
 * 報稅後鎖定整年資料，防止誤改 income / tax / maintenance / payment
 *
 * Usage:
 *   await assertRentalYearOpen(2025);  // throws RENTAL_YEAR_LOCKED if locked
 */
import prisma from '@/lib/prisma';

export async function getRentalYearLockStatus(year) {
  if (!year) return null;
  return prisma.rentalYearLock.findUnique({ where: { year: parseInt(year) } });
}

export async function assertRentalYearOpen(year) {
  if (!year) return;
  const lock = await getRentalYearLockStatus(year);
  if (lock) {
    const err = new Error(
      `RENTAL_YEAR_LOCKED:${year} 年租屋資料已結算鎖定，報稅後不可修改。如需更正請先解鎖。`
    );
    err.statusCode = 423;
    throw err;
  }
}

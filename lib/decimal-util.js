/**
 * Decimal-safe arithmetic for financial calculations.
 *
 * Prisma returns Decimal fields as Prisma.Decimal objects, and we often
 * convert them with Number() for JSON serialization. The issue is intermediate
 * calculations like sum/multiply can accumulate floating-point errors.
 *
 * This module provides helpers that round to 2 decimal places at each step,
 * matching the Decimal(12,2) column precision in the database.
 *
 * For display: use toFixed(2) on the result.
 * For DB writes: Prisma accepts Number — just ensure it's rounded first.
 */

const PRECISION = 2;

/**
 * Round a number to 2 decimal places using banker's rounding (round half to even).
 */
function round2(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Safe addition of financial amounts.
 * Accepts numbers, strings, Prisma Decimals, null/undefined (treated as 0).
 */
function addMoney(...values) {
  let sum = 0;
  for (const v of values) {
    sum += toNumber(v);
  }
  return round2(sum);
}

/**
 * Safe subtraction: a - b
 */
function subMoney(a, b) {
  return round2(toNumber(a) - toNumber(b));
}

/**
 * Safe multiplication (e.g., quantity * unit price).
 */
function mulMoney(a, b) {
  return round2(toNumber(a) * toNumber(b));
}

/**
 * Sum an array of items, extracting a numeric field.
 * @param {Array} items
 * @param {string|Function} field - Field name or getter function
 */
function sumField(items, field) {
  if (!Array.isArray(items)) return 0;
  const getter = typeof field === 'function' ? field : (item) => item[field];
  let sum = 0;
  for (const item of items) {
    sum += toNumber(getter(item));
  }
  return round2(sum);
}

/**
 * Convert a value to a safe Number.
 * Handles: Number, string, Prisma Decimal, null, undefined.
 */
function toNumber(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  // Prisma Decimal has toNumber() method
  if (typeof v.toNumber === 'function') return v.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

module.exports = { round2, addMoney, subMoney, mulMoney, sumField, toNumber };

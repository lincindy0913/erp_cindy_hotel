/**
 * Request timeout utilities.
 *
 * Provides helpers to enforce server-side timeouts on API route handlers
 * and Prisma transactions, preventing runaway queries from hanging indefinitely.
 */

/**
 * Default timeouts (milliseconds).
 * - READ: for GET requests (list/detail queries)
 * - WRITE: for POST/PUT/PATCH/DELETE (transactions, writes)
 * - LONG: for known slow operations (import, backup, OCR)
 */
export const TIMEOUTS = {
  READ: 15_000,       // 15s
  WRITE: 30_000,      // 30s
  LONG: 120_000,      // 2 min
  TRANSACTION: 30_000, // Prisma $transaction timeout
};

/**
 * Create an AbortSignal that fires after `ms` milliseconds.
 * Use with fetch() or other cancellable operations.
 *
 * @param {number} ms
 * @returns {AbortSignal}
 */
export function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}

/**
 * Prisma interactive transaction options with timeout.
 * Use as: prisma.$transaction(fn, TX_OPTIONS) or prisma.$transaction(fn, TX_OPTIONS_LONG)
 */
export const TX_OPTIONS = {
  maxWait: 10_000,            // max time to acquire a connection from the pool
  timeout: TIMEOUTS.TRANSACTION, // max time for the transaction to complete
};

export const TX_OPTIONS_LONG = {
  maxWait: 15_000,
  timeout: TIMEOUTS.LONG,
};

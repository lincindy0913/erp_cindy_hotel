import { calcBalanceDelta } from '@/lib/calc-balance-delta';

/**
 * Shared balance recalculation utility.
 * Correctly handles all transaction types: 收入, 支出, 移轉, 移轉入, and fees.
 * Delegates delta arithmetic to calcBalanceDelta (single source of truth).
 * Includes integrity verification — logs warnings if balance drifts unexpectedly.
 *
 * @param {object} db - Prisma client or transaction instance
 * @param {number} accountId - The account ID to recalculate
 * @returns {{ previousBalance: number, newBalance: number, transactionCount: number, drift: number }}
 */
export async function recalcBalance(db, accountId) {
  const account = await db.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return null;

  const transactions = await db.cashTransaction.findMany({
    where: { accountId },
    select: { id: true, type: true, amount: true, fee: true, hasFee: true },
  });

  const previousBalance = Number(account.currentBalance);
  const balance = Number(account.openingBalance) + calcBalanceDelta(transactions);

  await db.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: balance },
  });

  // Integrity check: detect unexpected drift
  const drift = Math.abs(previousBalance - balance);
  if (drift > 0.01 && transactions.length > 0) {
    // Log balance change for auditability (non-blocking)
    try {
      // Only log significant drifts (> $1) to avoid noise from normal operations
      if (drift > 1) {
        console.warn(
          `[BALANCE_DRIFT] Account #${accountId} "${account.name}": ` +
          `previous=${previousBalance}, recalculated=${balance}, drift=${drift.toFixed(2)}, ` +
          `txCount=${transactions.length}`
        );
      }
    } catch (_) { /* never block main operation */ }
  }

  return {
    previousBalance,
    newBalance: balance,
    transactionCount: transactions.length,
    drift: Math.round(drift * 100) / 100,
  };
}

/**
 * Shared balance recalculation utility.
 * Correctly handles all transaction types: 收入, 支出, 移轉, 移轉入, and fees.
 * Uses integer-cent arithmetic internally to avoid floating-point accumulation errors.
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
  // Use integer cents to avoid fp accumulation: round(x * 100) at each conversion
  const toCents = (v) => Math.round(Number(v) * 100);
  let balanceCents = toCents(account.openingBalance);
  let incomeCents = 0;
  let expenseCents = 0;

  for (const t of transactions) {
    const amtCents = toCents(t.amount);
    const feeCents = t.hasFee ? toCents(t.fee) : 0;

    if (t.type === '收入') {
      balanceCents += amtCents;
      incomeCents += amtCents;
    } else if (t.type === '支出') {
      balanceCents -= amtCents;
      balanceCents -= feeCents;
      expenseCents += amtCents + feeCents;
    } else if (t.type === '移轉') {
      balanceCents -= amtCents;
      balanceCents -= feeCents;
      expenseCents += amtCents + feeCents;
    } else if (t.type === '移轉入') {
      balanceCents += amtCents;
      incomeCents += amtCents;
    }
  }

  // Convert back from cents to dollars
  const balance = balanceCents / 100;
  const incomeTotal = incomeCents / 100;
  const expenseTotal = expenseCents / 100;

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
          `txCount=${transactions.length}, income=${incomeTotal.toFixed(2)}, expense=${expenseTotal.toFixed(2)}`
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

/**
 * Shared balance recalculation utility.
 * Correctly handles all transaction types: 收入, 支出, 移轉, 移轉入, and fees.
 *
 * @param {object} db - Prisma client or transaction instance
 * @param {number} accountId - The account ID to recalculate
 */
export async function recalcBalance(db, accountId) {
  const account = await db.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const transactions = await db.cashTransaction.findMany({
    where: { accountId },
    select: { type: true, amount: true, fee: true, hasFee: true },
  });

  let balance = Number(account.openingBalance);
  for (const t of transactions) {
    const amt = Number(t.amount);
    const fee = t.hasFee ? Number(t.fee) : 0;

    if (t.type === '收入') {
      balance += amt;
    } else if (t.type === '支出') {
      balance -= amt;
      balance -= fee;
    } else if (t.type === '移轉') {
      // Money leaving this account
      balance -= amt;
      balance -= fee;
    } else if (t.type === '移轉入') {
      // Money arriving to this account
      balance += amt;
    }
  }

  await db.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: balance },
  });
}

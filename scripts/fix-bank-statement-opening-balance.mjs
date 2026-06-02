/**
 * One-time fix: recalculate openingBalance for all existing BankStatements.
 *
 * Root cause: the original POST /api/bank-reconciliation used aggregate._sum.amount
 * without filtering by type, treating 支出/移轉 the same as 收入 (all added).
 * Correct logic mirrors recalc-balance.js: 收入/移轉入 add, 支出/移轉 subtract (incl. fee).
 *
 * Run once: node scripts/fix-bank-statement-opening-balance.mjs
 * Safe to re-run (idempotent).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error'],
});

function calcOpeningBalance(accountOpeningBalance, txsBefore) {
  const delta = txsBefore.reduce((sum, tx) => {
    const amt = Number(tx.amount || 0);
    const fee = tx.hasFee ? Number(tx.fee || 0) : 0;
    if (tx.type === '收入' || tx.type === '移轉入') return sum + amt;
    if (tx.type === '支出' || tx.type === '移轉')   return sum - amt - fee;
    return sum;
  }, 0);
  return Number(accountOpeningBalance) + delta;
}

async function main() {
  const statements = await prisma.bankStatement.findMany({
    select: { id: true, accountId: true, yearMonth: true, openingBalance: true },
    orderBy: [{ accountId: 'asc' }, { yearMonth: 'asc' }],
  });

  console.log(`Found ${statements.length} BankStatement(s) to check.`);
  if (statements.length === 0) { console.log('Nothing to do.'); return; }

  // Cache account openingBalance to avoid repeated lookups
  const accountCache = new Map();
  async function getAccount(accountId) {
    if (!accountCache.has(accountId)) {
      const acc = await prisma.cashAccount.findUnique({
        where: { id: accountId },
        select: { id: true, openingBalance: true },
      });
      accountCache.set(accountId, acc);
    }
    return accountCache.get(accountId);
  }

  let fixed = 0, skipped = 0, errors = 0;

  for (const stmt of statements) {
    try {
      const account = await getAccount(stmt.accountId);
      if (!account) {
        console.warn(`  [SKIP] accountId=${stmt.accountId} not found`);
        skipped++;
        continue;
      }

      const startDate = `${stmt.yearMonth}-01`;

      const txsBefore = await prisma.cashTransaction.findMany({
        where: { accountId: stmt.accountId, transactionDate: { lt: startDate } },
        select: { type: true, amount: true, fee: true, hasFee: true },
      });

      const correct = calcOpeningBalance(account.openingBalance, txsBefore);
      const current = Number(stmt.openingBalance);

      if (Math.abs(correct - current) < 0.005) {
        skipped++;
        continue;
      }

      await prisma.bankStatement.update({
        where: { id: stmt.id },
        data:  { openingBalance: correct },
      });

      console.log(
        `  [FIX] id=${stmt.id} acct=${stmt.accountId} ${stmt.yearMonth}: ` +
        `${current.toFixed(2)} → ${correct.toFixed(2)} (diff ${(correct - current).toFixed(2)})`
      );
      fixed++;
    } catch (err) {
      console.error(`  [ERROR] id=${stmt.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. fixed=${fixed} skipped=${skipped} errors=${errors}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

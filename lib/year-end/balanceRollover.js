/**
 * Read active cash accounts and prepare balance records for year-end.
 * No writes — all writes happen in the final atomic transaction (step 7).
 *
 * @param {object} prisma
 * @param {number} yearEndId
 * @returns {{ balanceRecords: object[], cashAccounts: object[], totalCashBalance: number }}
 */
export async function prepareBalanceRecords(prisma, yearEndId) {
  const cashAccounts = await prisma.cashAccount.findMany({ where: { isActive: true } });

  const balanceRecords = cashAccounts.map(account => ({
    yearEndId,
    accountId: account.id,
    accountName: account.name,
    accountType: account.type,
    closingBalance: Number(account.currentBalance),
    nextYearOpeningBalance: Number(account.currentBalance)
  }));

  const totalCashBalance = cashAccounts.reduce((sum, a) => sum + Number(a.currentBalance), 0);

  return { balanceRecords, cashAccounts, totalCashBalance };
}

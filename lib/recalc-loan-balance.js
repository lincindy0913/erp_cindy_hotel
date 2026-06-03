/**
 * Recalculate LoanMaster.currentBalance from first principles.
 *
 * currentBalance = originalAmount - SUM(actualPrincipal WHERE status='已核實')
 *
 * Mirrors recalc-balance.js pattern for CashAccount.
 *
 * @param {object} db - Prisma client or transaction instance
 * @param {number} loanId
 */
export async function recalcLoanBalance(db, loanId) {
  const loan = await db.loanMaster.findUnique({
    where: { id: loanId },
    select: { id: true, originalAmount: true, currentBalance: true }
  });
  if (!loan) return null;

  const { _sum } = await db.loanMonthlyRecord.aggregate({
    where: { loanId, status: '已核實' },
    _sum: { actualPrincipal: true }
  });

  const totalRepaid = Number(_sum.actualPrincipal || 0);
  const newBalance = Math.max(0, Number(loan.originalAmount) - totalRepaid);

  await db.loanMaster.update({
    where: { id: loanId },
    data: { currentBalance: newBalance }
  });

  return {
    previousBalance: Number(loan.currentBalance),
    newBalance,
    totalRepaid,
  };
}

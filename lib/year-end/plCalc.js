/**
 * Calculate full-year P&L figures.
 * COGS = openingInventory + purchases - closingInventory
 *
 * @param {object} prisma
 * @param {{ year: number, yearStart: string, yearEndDate: string, closingInventory: number }} opts
 * @returns {Promise<object>} pl result object
 */
export async function calcProfitLoss(prisma, { year, yearStart, yearEndDate, closingInventory }) {
  const [salesRevenue, pmsIncome, purchaseCost, expenseTotal, deptExpenseTotal] = await Promise.all([
    prisma.salesMaster.aggregate({
      where: { invoiceDate: { gte: yearStart, lte: yearEndDate }, status: { not: '已作廢' } },
      _sum: { totalAmount: true },
      _count: true
    }),
    prisma.pmsIncomeRecord.aggregate({
      where: { businessDate: { gte: yearStart, lte: yearEndDate }, entryType: '貸方' },
      _sum: { amount: true }
    }),
    prisma.purchaseMaster.aggregate({
      where: { purchaseDate: { gte: yearStart, lte: yearEndDate }, status: { notIn: ['已作廢', '已退貨'] } },
      _sum: { totalAmount: true },
      _count: true
    }),
    prisma.expense.aggregate({
      where: { invoiceDate: { gte: yearStart, lte: yearEndDate }, status: { not: '已作廢' } },
      _sum: { amount: true },
      _count: true
    }),
    prisma.departmentExpense.aggregate({
      where: { year },
      _sum: { totalAmount: true }
    }),
  ]);

  const totalRevenue     = Number(salesRevenue._sum.totalAmount || 0);
  const totalPmsIncome   = Number(pmsIncome._sum.amount || 0);
  const totalPurchase    = Number(purchaseCost._sum.totalAmount || 0);
  const totalExpenses    = Number(expenseTotal._sum.amount || 0);
  const totalDeptExpenses = Number(deptExpenseTotal._sum.totalAmount || 0);

  // COGS = 期初存貨 + 本年進貨 - 期末存貨
  const priorYearEnd = await prisma.yearEndRollover.findUnique({
    where: { year: year - 1 },
    select: { id: true }
  });
  const openingInventory = priorYearEnd
    ? Number((await prisma.yearEndInventory.aggregate({
        where: { yearEndId: priorYearEnd.id },
        _sum: { closingValue: true }
      }))._sum.closingValue || 0)
    : 0;

  const totalCOGS   = openingInventory + totalPurchase - closingInventory;
  const grossRevenue = totalRevenue + totalPmsIncome;
  const grossProfit  = grossRevenue - totalCOGS;
  const netIncome    = grossProfit - totalExpenses - totalDeptExpenses;

  return {
    totalRevenue,
    totalPmsIncome,
    totalPurchase,
    openingInventory,
    closingInventory,
    totalCOGS,
    totalExpenses,
    totalDeptExpenses,
    grossRevenue,
    grossProfit,
    netIncome,
  };
}

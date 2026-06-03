/**
 * Build the three financial statement objects (income statement, balance sheet, cash flow).
 * Pure computation — no DB writes.
 *
 * @param {object} prisma
 * @param {{ year, yearStart, yearEndDate, pl, cashAccounts, inventorySnapshots, totalCashBalance }} opts
 * @returns {Promise<{ incomeStatement, balanceSheet, cashFlowStatement }>}
 */
export async function buildFinancialStatements(prisma, {
  year, yearStart, yearEndDate, pl, cashAccounts, inventorySnapshots, totalCashBalance
}) {
  const {
    totalRevenue, totalPmsIncome, grossRevenue, totalCOGS, openingInventory, totalPurchase,
    closingInventory, grossProfit, totalExpenses, totalDeptExpenses, netIncome
  } = pl;

  // ── Income statement (with monthly breakdown) ────────────────────────
  const [salesRows, pmsRows, purchaseRows, expenseRows, deptRows] = await Promise.all([
    prisma.salesMaster.findMany({
      where: { invoiceDate: { gte: yearStart, lte: yearEndDate }, status: { not: '已作廢' } },
      select: { invoiceDate: true, totalAmount: true }
    }),
    prisma.pmsIncomeRecord.findMany({
      where: { businessDate: { gte: yearStart, lte: yearEndDate }, entryType: '貸方' },
      select: { businessDate: true, amount: true }
    }),
    prisma.purchaseMaster.findMany({
      where: { purchaseDate: { gte: yearStart, lte: yearEndDate }, status: { notIn: ['已作廢', '已退貨'] } },
      select: { purchaseDate: true, totalAmount: true }
    }),
    prisma.expense.findMany({
      where: { invoiceDate: { gte: yearStart, lte: yearEndDate }, status: { not: '已作廢' } },
      select: { invoiceDate: true, amount: true }
    }),
    prisma.departmentExpense.findMany({
      where: { year },
      select: { month: true, totalAmount: true }
    }),
  ]);

  const getMonth = (dateStr) => dateStr ? parseInt(dateStr.substring(5, 7)) : 0;
  const monthlySales    = Array(13).fill(0);
  const monthlyPms      = Array(13).fill(0);
  const monthlyPurchase = Array(13).fill(0);
  const monthlyExpense  = Array(13).fill(0);
  const monthlyDept     = Array(13).fill(0);

  for (const r of salesRows)    monthlySales[getMonth(r.invoiceDate)]    += Number(r.totalAmount || 0);
  for (const r of pmsRows)      monthlyPms[getMonth(r.businessDate)]     += Number(r.amount || 0);
  for (const r of purchaseRows) monthlyPurchase[getMonth(r.purchaseDate)] += Number(r.totalAmount || 0);
  for (const r of expenseRows)  monthlyExpense[getMonth(r.invoiceDate)]  += Number(r.amount || 0);
  for (const r of deptRows)     monthlyDept[r.month || 0]                += Number(r.totalAmount || 0);

  const salesByMonth = [];
  for (let m = 1; m <= 12; m++) {
    const mRev  = monthlySales[m] + monthlyPms[m];
    const mCogs = monthlyPurchase[m];
    const mExp  = monthlyExpense[m] + monthlyDept[m];
    salesByMonth.push({ month: m, revenue: mRev, cogs: mCogs, grossProfit: mRev - mCogs, expenses: mExp, netIncome: mRev - mCogs - mExp });
  }

  const incomeStatement = {
    year,
    revenue: { salesRevenue: totalRevenue, pmsIncome: totalPmsIncome, totalRevenue: grossRevenue },
    costOfGoodsSold: totalCOGS,
    cogsBreakdown: { openingInventory, purchases: totalPurchase, closingInventory, total: totalCOGS },
    grossProfit,
    operatingExpenses: { expenses: totalExpenses, departmentExpenses: totalDeptExpenses, totalExpenses: totalExpenses + totalDeptExpenses },
    netIncome,
    monthlyBreakdown: salesByMonth
  };

  // ── Balance sheet ────────────────────────────────────────────────────
  const inventoryValue = inventorySnapshots.reduce((sum, s) => sum + Number(s.closingValue), 0);

  const [loans, accountsPayable] = await Promise.all([
    prisma.loanMaster.findMany({
      where: { status: '使用中' },
      select: { loanName: true, currentBalance: true, bankName: true }
    }),
    prisma.expense.aggregate({
      where: { status: { not: '已完成' } },
      _sum: { amount: true }
    }),
  ]);

  const totalLoanBalance = loans.reduce((sum, l) => sum + Number(l.currentBalance), 0);
  const totalAP = Number(accountsPayable._sum.amount || 0);

  const balanceSheet = {
    year,
    assets: {
      currentAssets: { cashAndEquivalents: totalCashBalance, inventory: inventoryValue, totalCurrentAssets: totalCashBalance + inventoryValue },
      totalAssets: totalCashBalance + inventoryValue
    },
    liabilities: {
      currentLiabilities: { accountsPayable: totalAP, totalCurrentLiabilities: totalAP },
      longTermLiabilities: {
        loans: totalLoanBalance,
        loanDetails: loans.map(l => ({ name: l.loanName, bank: l.bankName, balance: Number(l.currentBalance) })),
        totalLongTermLiabilities: totalLoanBalance
      },
      totalLiabilities: totalAP + totalLoanBalance
    },
    equity: { retainedEarnings: netIncome, totalEquity: netIncome },
    balanceCheck: {
      totalAssets: totalCashBalance + inventoryValue,
      totalLiabilitiesAndEquity: totalAP + totalLoanBalance + netIncome,
      isBalanced: Math.abs((totalCashBalance + inventoryValue) - (totalAP + totalLoanBalance + netIncome)) < 0.01
    }
  };

  // ── Cash flow statement ──────────────────────────────────────────────
  const cashTransactions = await prisma.cashTransaction.findMany({
    where: { transactionDate: { gte: yearStart, lte: yearEndDate }, status: '已確認' },
    include: {
      account:  { select: { name: true, type: true } },
      category: { select: { name: true, type: true, cashFlowType: true } }
    }
  });

  let operatingIncome = 0, operatingExpense = 0;
  let investingInflow = 0, investingOutflow = 0;
  let financingInflow = 0, financingOutflow = 0;
  const monthlyFlows = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, operating: 0, investing: 0, financing: 0, net: 0 }));

  for (const tx of cashTransactions) {
    const amount       = Number(tx.amount);
    const txMonth      = parseInt(tx.transactionDate.substring(5, 7));
    const cashFlowType = tx.category?.cashFlowType || 'operating';
    const isInvesting  = cashFlowType === 'investing';
    const isFinancing  = cashFlowType === 'financing';
    if (tx.type === '收入') {
      if (isInvesting)      { investingInflow  += amount; monthlyFlows[txMonth - 1].investing += amount; }
      else if (isFinancing) { financingInflow  += amount; monthlyFlows[txMonth - 1].financing += amount; }
      else                  { operatingIncome  += amount; monthlyFlows[txMonth - 1].operating += amount; }
    } else if (tx.type === '支出') {
      if (isInvesting)      { investingOutflow += amount; monthlyFlows[txMonth - 1].investing -= amount; }
      else if (isFinancing) { financingOutflow += amount; monthlyFlows[txMonth - 1].financing -= amount; }
      else                  { operatingExpense += amount; monthlyFlows[txMonth - 1].operating -= amount; }
    }
  }
  for (const mf of monthlyFlows) mf.net = mf.operating + mf.investing + mf.financing;

  const cashFlowStatement = {
    year,
    operatingActivities: { income: operatingIncome, expenses: operatingExpense, netOperating: operatingIncome - operatingExpense },
    investingActivities: { inflow: investingInflow, outflow: investingOutflow, netInvesting: investingInflow - investingOutflow },
    financingActivities: { inflow: financingInflow, outflow: financingOutflow, netFinancing: financingInflow - financingOutflow },
    netCashChange: (operatingIncome - operatingExpense) + (investingInflow - investingOutflow) + (financingInflow - financingOutflow),
    totalTransactions: cashTransactions.length,
    monthlyBreakdown: monthlyFlows
  };

  return { incomeStatement, balanceSheet, cashFlowStatement };
}

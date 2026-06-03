import {
  PL_LEVEL1_ORDER, PL_UNCLASSIFIED_INCOME, PL_UNCLASSIFIED_EXPENSE,
  PL_LEVEL1_INCOME, PL_LEVEL1_EXPENSE, PL_COST_GROUP
} from '@/lib/pl-constants';

/**
 * Shared month-end report generation logic.
 * Used by both the month-end POST (close) and POST /regenerate endpoints.
 *
 * @param {import('@prisma/client').PrismaClient} db - Prisma client or transaction
 * @param {{ year: number, month: number, monthStr: string, periodStart: string, periodEnd: string, warehouse: string|null }} opts
 * @returns {Promise<Array<{ reportType: string, data: object }>>}
 */
export async function generateMonthEndReports(db, { year, month, monthStr, periodStart, periodEnd, warehouse }) {
  const reports = [];

  // --- Purchase summary ---
  const purchaseWhere = { purchaseDate: { gte: periodStart, lte: periodEnd } };
  if (warehouse) purchaseWhere.warehouse = warehouse;

  const purchaseData = await db.purchaseMaster.findMany({
    where: purchaseWhere,
    include: { supplier: { select: { name: true } } }
  });

  const purchaseBySup = {};
  const purchaseByWh = {};
  purchaseData.forEach(p => {
    const supName = p.supplier?.name || '未指定';
    if (!purchaseBySup[supName]) purchaseBySup[supName] = { count: 0, amount: 0, tax: 0, total: 0 };
    purchaseBySup[supName].count++;
    purchaseBySup[supName].amount += Number(p.amount);
    purchaseBySup[supName].tax    += Number(p.tax);
    purchaseBySup[supName].total  += Number(p.totalAmount);

    const wh = p.warehouse || '未指定';
    if (!purchaseByWh[wh]) purchaseByWh[wh] = { count: 0, amount: 0, tax: 0, total: 0 };
    purchaseByWh[wh].count++;
    purchaseByWh[wh].amount += Number(p.amount);
    purchaseByWh[wh].tax    += Number(p.tax);
    purchaseByWh[wh].total  += Number(p.totalAmount);
  });

  reports.push({
    reportType: '進貨彙總',
    data: {
      period: `${year}/${monthStr}`,
      totalCount: purchaseData.length,
      totalAmount: purchaseData.reduce((s, p) => s + Number(p.totalAmount), 0),
      bySupplier: Object.entries(purchaseBySup).map(([name, d]) => ({ name, ...d })),
      byWarehouse: Object.entries(purchaseByWh).map(([name, d]) => ({ name, ...d }))
    }
  });

  // --- Sales summary ---
  const salesData = await db.salesMaster.findMany({
    where: { invoiceDate: { gte: periodStart, lte: periodEnd } },
    include: { details: { select: { warehouse: true, subtotal: true } } }
  });

  const salesByStatus = {};
  const salesByWh = {};
  salesData.forEach(s => {
    const st = s.status || '未指定';
    if (!salesByStatus[st]) salesByStatus[st] = { count: 0, total: 0 };
    salesByStatus[st].count++;
    salesByStatus[st].total += Number(s.totalAmount);

    s.details.forEach(d => {
      const wh = d.warehouse || '未指定';
      if (!salesByWh[wh]) salesByWh[wh] = { count: 0, total: 0 };
      salesByWh[wh].count++;
      salesByWh[wh].total += Number(d.subtotal || 0);
    });
  });

  reports.push({
    reportType: '銷貨彙總',
    data: {
      period: `${year}/${monthStr}`,
      totalCount: salesData.length,
      totalAmount: salesData.reduce((s, r) => s + Number(r.totalAmount), 0),
      byStatus: Object.entries(salesByStatus).map(([name, d]) => ({ name, ...d })),
      byWarehouse: Object.entries(salesByWh).map(([name, d]) => ({ name, ...d }))
    }
  });

  // --- Expense summary ---
  const expenseWhere = { invoiceDate: { gte: periodStart, lte: periodEnd } };
  if (warehouse) expenseWhere.warehouse = warehouse;

  const commonExpWhere = { expenseMonth: `${year}-${monthStr}`, status: '已確認' };
  if (warehouse) commonExpWhere.warehouse = warehouse;

  const [expenseData, commonExpData] = await Promise.all([
    db.expense.findMany({ where: expenseWhere }),
    db.commonExpenseRecord.findMany({
      where: commonExpWhere,
      include: { template: { select: { name: true, category: { select: { name: true } } } } }
    })
  ]);

  const expByCat = {};
  const expByWh = {};
  expenseData.forEach(e => {
    const cat = e.sourceType || '未分類';
    if (!expByCat[cat]) expByCat[cat] = { count: 0, total: 0 };
    expByCat[cat].count++;
    expByCat[cat].total += Number(e.amount);

    const wh = e.warehouse || '未指定';
    if (!expByWh[wh]) expByWh[wh] = { count: 0, total: 0 };
    expByWh[wh].count++;
    expByWh[wh].total += Number(e.amount);
  });

  commonExpData.forEach(e => {
    const cat = e.template?.category?.name || e.template?.name || '常見費用';
    if (!expByCat[cat]) expByCat[cat] = { count: 0, total: 0 };
    expByCat[cat].count++;
    expByCat[cat].total += Number(e.totalDebit);

    const wh = e.warehouse || '未指定';
    if (!expByWh[wh]) expByWh[wh] = { count: 0, total: 0 };
    expByWh[wh].count++;
    expByWh[wh].total += Number(e.totalDebit);
  });

  reports.push({
    reportType: '支出彙總',
    data: {
      period: `${year}/${monthStr}`,
      totalCount: expenseData.length + commonExpData.length,
      totalAmount: expenseData.reduce((s, e) => s + Number(e.amount), 0)
        + commonExpData.reduce((s, e) => s + Number(e.totalDebit), 0),
      byCategory: Object.entries(expByCat).map(([name, d]) => ({ name, ...d })),
      byWarehouse: Object.entries(expByWh).map(([name, d]) => ({ name, ...d }))
    }
  });

  // --- Cash flow summary ---
  const cashTxWhere = { transactionDate: { gte: periodStart, lte: periodEnd } };
  if (warehouse) cashTxWhere.warehouse = warehouse;

  const cashTxData = await db.cashTransaction.findMany({
    where: cashTxWhere,
    include: { account: { select: { name: true, type: true } } }
  });

  const cashByType = {};
  cashTxData.forEach(tx => {
    const aType = tx.account?.type || '未分類';
    if (!cashByType[aType]) cashByType[aType] = { income: 0, expense: 0, transfer: 0, net: 0 };
    const amt = Number(tx.amount);
    if (tx.type === '收入')      { cashByType[aType].income   += amt; cashByType[aType].net += amt; }
    else if (tx.type === '支出') { cashByType[aType].expense  += amt; cashByType[aType].net -= amt; }
    else if (tx.type === '移轉') { cashByType[aType].transfer += amt; }
  });

  reports.push({
    reportType: '現金流彙總',
    data: {
      period: `${year}/${monthStr}`,
      totalTransactions: cashTxData.length,
      byAccountType: Object.entries(cashByType).map(([name, d]) => ({ name, ...d }))
    }
  });

  // --- P&L snapshot ---
  try {
    const plTxs = await db.cashTransaction.findMany({
      where: {
        transactionDate: { gte: periodStart, lte: periodEnd },
        isReversal: false,
        reversedById: null,
        ...(warehouse ? { warehouse } : {}),
      },
      select: {
        type: true, amount: true,
        category: { select: { id: true, name: true, level1: true, plGroup: true, plOrder: true } }
      }
    });

    const plMap = {};
    for (const tx of plTxs) {
      const cat     = tx.category;
      const level1  = cat?.level1  || (tx.type === '收入' ? PL_LEVEL1_INCOME : PL_LEVEL1_EXPENSE);
      const plGroup = cat?.plGroup || (tx.type === '收入' ? PL_UNCLASSIFIED_INCOME : PL_UNCLASSIFIED_EXPENSE);
      const key     = `${level1}|${plGroup}`;
      if (!plMap[key]) plMap[key] = { level1, plGroup, plOrder: cat?.plOrder || 999, income: 0, expense: 0 };
      const amt = Number(tx.amount);
      if (tx.type === '收入') plMap[key].income  += amt;
      else                    plMap[key].expense += amt;
    }

    const plGroups = Object.values(plMap).sort((a, b) =>
      ((PL_LEVEL1_ORDER[a.level1] || 9) - (PL_LEVEL1_ORDER[b.level1] || 9)) || a.plOrder - b.plOrder
    );

    const totalIncomePL = plGroups.filter(g => g.level1 === PL_LEVEL1_INCOME).reduce((s, g) => s + g.income - g.expense, 0);
    const ccFee         = plGroups.find(g => g.plGroup === PL_COST_GROUP)?.expense || 0;
    const grossProfitPL = totalIncomePL - ccFee;
    const totalOpExpPL  = plGroups.filter(g => g.level1 === PL_LEVEL1_EXPENSE && g.plGroup !== PL_COST_GROUP).reduce((s, g) => s + g.expense, 0);
    const operatingPL   = grossProfitPL - totalOpExpPL;
    const bizOutsidePL  = plGroups.filter(g => g.level1 === '業外').reduce((s, g) => s + g.income - g.expense, 0);
    const netIncomePL   = operatingPL + bizOutsidePL;

    reports.push({
      reportType: '損益快照',
      data: {
        period: `${year}/${monthStr}`,
        groups: plGroups.map(g => ({ ...g, income: Math.round(g.income), expense: Math.round(g.expense) })),
        summary: {
          totalIncome:     Math.round(totalIncomePL),
          ccFee:           Math.round(ccFee),
          grossProfit:     Math.round(grossProfitPL),
          totalOpExp:      Math.round(totalOpExpPL),
          operatingIncome: Math.round(operatingPL),
          bizOutsideNet:   Math.round(bizOutsidePL),
          netIncome:       Math.round(netIncomePL),
        }
      }
    });
  } catch (plErr) {
    console.error('損益快照生成失敗（非阻斷）:', plErr.message);
  }

  return reports;
}

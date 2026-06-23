import { localDateStr } from '@/lib/localDate';
import { calcBalanceDelta } from '@/lib/calc-balance-delta';

/**
 * Run all month-end pre-closing checks.
 * Returns an array of check result objects — does not throw or return HTTP responses.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ year: number, month: number, monthStr: string, periodStart: string, periodEnd: string, warehouse: string|null, now: Date }} opts
 * @returns {Promise<Array<{ name: string, count: number, passed: boolean, level: string, detail?: string, link?: string, linkText?: string }>>}
 */
export async function runMonthEndPreChecks(prisma, { year, month, monthStr, periodStart, periodEnd, warehouse, now }) {
  const preChecks = [];

  // 1. 逾期待入庫進貨單（超過30天）
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = localDateStr(thirtyDaysAgo);

  const pendingPurchaseWhere = { status: '待入庫', purchaseDate: { lte: thirtyDaysAgoStr } };
  if (warehouse) pendingPurchaseWhere.warehouse = warehouse;

  const pendingPurchases = await prisma.purchaseMaster.count({ where: pendingPurchaseWhere });
  preChecks.push({
    name: '逾期待入庫進貨單（超過30天）',
    count: pendingPurchases,
    passed: pendingPurchases === 0,
    level: pendingPurchases > 0 ? 'warning' : 'pass',
  });

  // 2. 逾期待核銷發票（超過60天）
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyDaysAgoStr = localDateStr(sixtyDaysAgo);

  const pendingInvoices = await prisma.salesMaster.count({
    where: { status: '待核銷', invoiceDate: { lte: sixtyDaysAgoStr } },
  });
  preChecks.push({
    name: '逾期待核銷發票（超過60天）',
    count: pendingInvoices,
    passed: pendingInvoices === 0,
    level: pendingInvoices > 0 ? 'warning' : 'pass',
    link: `/sales?status=待核銷&view=list`,
    linkText: '前往發票列表',
  });

  // 3. 待出納付款單
  const pendingCashierOrders = await prisma.paymentOrder.count({ where: { status: '待出納' } });
  preChecks.push({
    name: '待出納付款單',
    count: pendingCashierOrders,
    passed: pendingCashierOrders === 0,
    level: pendingCashierOrders > 0 ? 'warning' : 'pass',
    link: '/cashier',
    linkText: '前往出納',
    detail: pendingCashierOrders > 0
      ? `${pendingCashierOrders} 張付款單已建立送出，但出納尚未點擊「執行」確認。注意：此項只查已建立付款單的出納狀態，不代表所有應付帳款均已建單。`
      : undefined,
  });

  // 4. 未送出付款單（草稿）
  const draftOrders = await prisma.paymentOrder.count({ where: { status: '草稿' } });
  preChecks.push({
    name: '未送出付款單（草稿）',
    count: draftOrders,
    passed: draftOrders === 0,
    level: draftOrders > 0 ? 'warning' : 'pass',
    link: '/finance?tab=draft',
    linkText: '前往草稿付款單',
  });

  // 5. 現金帳戶餘額不一致（批次查詢取代 N+1 per-account findMany）
  let cashBalanceMismatch = 0;
  try {
    const cashAccounts = await prisma.cashAccount.findMany({
      where: warehouse ? { warehouse } : {},
      select: { id: true, name: true, openingBalance: true, currentBalance: true },
    });

    if (cashAccounts.length > 0) {
      const allTxs = await prisma.cashTransaction.findMany({
        where: { accountId: { in: cashAccounts.map(a => a.id) }, status: '已確認' },
        select: { accountId: true, type: true, amount: true, fee: true, hasFee: true },
      });
      const txsByAccount = new Map();
      for (const tx of allTxs) {
        if (!txsByAccount.has(tx.accountId)) txsByAccount.set(tx.accountId, []);
        txsByAccount.get(tx.accountId).push(tx);
      }
      for (const account of cashAccounts) {
        const txs = txsByAccount.get(account.id) ?? [];
        const expectedBalance = Number(account.openingBalance) + calcBalanceDelta(txs);
        const currentBalance  = Number(account.currentBalance);
        if (Math.abs(expectedBalance - currentBalance) > 0.01) cashBalanceMismatch++;
      }
    }
  } catch (e) {
    console.error('現金帳戶檢查錯誤:', e);
  }
  preChecks.push({
    name: '現金帳戶餘額不一致',
    count: cashBalanceMismatch,
    passed: cashBalanceMismatch === 0,
    level: cashBalanceMismatch > 0 ? 'warning' : 'pass',
  });

  // 6. 館別未完成個別月結（全館月結時才檢查）
  if (!warehouse) {
    try {
      const activeBuildings = await prisma.warehouse.findMany({
        where: { type: 'building', isActive: true },
        select: { name: true },
      });
      if (activeBuildings.length > 0) {
        const closedStatuses = await prisma.monthEndStatus.findMany({
          where: {
            year, month,
            warehouse: { in: activeBuildings.map(w => w.name) },
            status: { in: ['已結帳', '已鎖定'] },
          },
          select: { warehouse: true },
        });
        const closedSet = new Set(closedStatuses.map(s => s.warehouse));
        const unclosedBuildings = activeBuildings.filter(w => !closedSet.has(w.name));
        if (unclosedBuildings.length > 0) {
          preChecks.push({
            name: '館別未完成個別月結',
            count: unclosedBuildings.length,
            passed: true,
            level: 'warning',
            detail: `以下館別尚未完成個別月結：${unclosedBuildings.map(w => w.name).join('、')}`,
          });
        }
      }
    } catch (e) {
      console.error('跨館別月結驗證錯誤:', e);
    }
  }

  // 7. 現金盤點未完成
  try {
    const lastDayOfMonth = new Date(year, month, 0);
    const lastDayStr = localDateStr(lastDayOfMonth);

    const cashAccountsAll = await prisma.cashAccount.findMany({
      where: { type: '現金', isActive: true, ...(warehouse ? { warehouse } : {}) },
      select: { id: true, name: true },
    });

    if (cashAccountsAll.length > 0) {
      const completedCounts = await prisma.cashCount.findMany({
        where: {
          countDate: lastDayStr,
          status: { in: ['confirmed', 'approved'] },
          accountId: { in: cashAccountsAll.map(a => a.id) },
        },
        select: { accountId: true },
      });
      const completedAccountIds = new Set(completedCounts.map(c => c.accountId));
      const missingAccounts = cashAccountsAll.filter(a => !completedAccountIds.has(a.id));

      const pendingAbnormal = await prisma.cashCount.count({
        where: {
          countDate: { gte: `${year}-${monthStr}-01`, lte: lastDayStr },
          status: 'pending',
          isAbnormal: true,
        },
      });

      preChecks.push({
        name: '現金盤點未完成',
        count: missingAccounts.length,
        passed: missingAccounts.length === 0,
        level: missingAccounts.length > 0 ? 'warning' : 'pass',
        detail: missingAccounts.length > 0
          ? `以下帳戶尚未完成 ${lastDayStr} 盤點：${missingAccounts.map(a => a.name).join('、')}`
          : undefined,
      });

      if (pendingAbnormal > 0) {
        preChecks.push({
          name: '現金盤點待審核',
          count: pendingAbnormal,
          passed: true,
          level: 'warning',
          detail: `${pendingAbnormal} 筆現金盤點待主管審核，建議先完成審核`,
        });
      }
    }
  } catch (e) {
    console.error('現金盤點檢查錯誤:', e);
  }

  // 8. PMS 月結算未完成
  try {
    const unsettledPms = await prisma.pmsMonthlySettlement.findMany({
      where: { settlementMonth: `${year}-${monthStr}`, status: { not: '已結算' } },
      select: { warehouse: true, status: true },
    });
    if (unsettledPms.length > 0) {
      preChecks.push({
        name: 'PMS 月結算未完成',
        count: unsettledPms.length,
        passed: true,
        level: 'warning',
        detail: `以下館別 PMS 月結算未完成：${unsettledPms.map(s => `${s.warehouse}（${s.status}）`).join('、')}`,
        link: '/pms-income',
        linkText: '前往 PMS 收入',
      });
    }
  } catch (e) {
    console.error('PMS 月結算檢查錯誤:', e);
  }

  // 9. 租屋已確認收款未入帳
  try {
    const unlinkedRental = await prisma.rentalIncome.count({
      where: {
        incomeYear: year,
        incomeMonth: month,
        status: { in: ['completed', 'partial'] },
        cashTransactionId: null,
      },
    });
    if (unlinkedRental > 0) {
      preChecks.push({
        name: '租屋已確認收款未入帳',
        count: unlinkedRental,
        passed: true,
        level: 'warning',
        detail: `${unlinkedRental} 筆已確認租金尚未建立現金流記錄，月結損益將有落差`,
        link: '/rentals?tab=cashier',
        linkText: '前往租屋收款',
      });
    }
  } catch (e) {
    console.error('租屋收款入帳檢查錯誤:', e);
  }

  // 10. 庫存盤點未完成
  try {
    const activeBuildings = await prisma.warehouse.findMany({
      where: { type: 'building', isActive: true },
      select: { name: true },
    });
    if (activeBuildings.length > 0) {
      const countedThisMonth = await prisma.stockCount.findMany({
        where: { countDate: { gte: periodStart, lte: periodEnd }, type: 'count' },
        select: { warehouse: true },
        distinct: ['warehouse'],
      });
      const countedSet = new Set(countedThisMonth.map(s => s.warehouse));
      const uncountedBlds = activeBuildings.filter(w => !countedSet.has(w.name));
      if (uncountedBlds.length > 0) {
        preChecks.push({
          name: '庫存盤點未完成',
          count: uncountedBlds.length,
          passed: true,
          level: 'warning',
          detail: `以下館別本月尚未完成庫存盤點：${uncountedBlds.map(w => w.name).join('、')}`,
          link: '/inventory?tab=count',
          linkText: '前往庫存盤點',
        });
      }
    }
  } catch (e) {
    console.error('庫存盤點檢查錯誤:', e);
  }

  // 11. 工程估驗已核定未開票
  try {
    const certifiedClaims = await prisma.engineeringProgressClaim.findMany({
      where: { status: 'certified', certifiedDate: { gte: periodStart, lte: periodEnd } },
      include: {
        outputInvoices: { where: { status: { not: '已作廢' } }, select: { id: true } },
      },
    });
    const uninvoiced = certifiedClaims.filter(c => c.outputInvoices.length === 0);
    if (uninvoiced.length > 0) {
      preChecks.push({
        name: '工程估驗已核定未開票',
        count: uninvoiced.length,
        passed: true,
        level: 'warning',
        detail: `${uninvoiced.length} 筆已核定估驗尚未開立銷項發票`,
        link: '/engineering?tab=progressClaims',
        linkText: '前往估驗計價',
      });
    }
  } catch (e) {
    console.error('工程估驗發票檢查錯誤:', e);
  }

  return preChecks;
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// N01-N14 notification definitions (spec7/spec28)
const NOTIFICATION_DEFS = {
  N01: { type: 'PMS 報表未匯入', level: 'warning', title: 'PMS 報表未匯入', targetUrl: '/pms-income' },
  N02: { type: '貸款還款提醒', level: 'urgent', title: '貸款還款日即將到來', targetUrl: '/loans' },
  N03: { type: '支票到期提醒', level: 'urgent', title: '支票即將到期', targetUrl: '/checks' },
  N04: { type: '支票逾期警告', level: 'critical', title: '支票已逾期未兌現', targetUrl: '/checks' },
  N05: { type: '付款單待出納', level: 'warning', title: '付款單待出納', targetUrl: '/cashier' },
  N06: { type: '付款單被退回', level: 'urgent', title: '付款單已退回', targetUrl: '/finance' },
  N07: { type: '貸款到期預警', level: 'warning', title: '貸款即將到期', targetUrl: '/loans' },
  N08: { type: '費用傳票待確認', level: 'warning', title: '費用傳票待確認', targetUrl: '/expenses' },
  N09: { type: '庫存偏低', level: 'warning', title: '庫存偏低', targetUrl: '/inventory' },
  N10: { type: '月結未執行', level: 'warning', title: '月結未執行', targetUrl: '/month-end' },
  N11: { type: 'PMS 貸借差異', level: 'warning', title: 'PMS 貸借差異', targetUrl: '/pms-income' },
  N12: { type: '信用卡繳款到期', level: 'urgent', title: '信用卡帳單繳款即將到期', targetUrl: '/reconciliation' },
  N13: { type: '現金盤點逾期', level: 'urgent', title: '現金盤點逾期', targetUrl: '/cashflow?tab=cash-count' },
  N14: { type: '備份失敗或驗證失敗', level: 'critical', title: '資料備份異常', targetUrl: '/admin/backup' },
};

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.NOTIFICATION_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      // empty body is fine
    }

    const notifications = [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // ==============================
    // N01: PMS 報表未匯入 - No PMS import in last 3 days for any warehouse
    // ==============================
    try {
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

      // Get all active warehouses
      const warehouses = await prisma.warehouse.findMany({
        where: { isActive: true },
        select: { name: true },
      });

      const missingWarehouses = [];
      for (const wh of warehouses) {
        const recentImport = await prisma.pmsImportBatch.findFirst({
          where: {
            warehouse: wh.name,
            businessDate: { gte: threeDaysAgoStr },
          },
        });
        if (!recentImport) {
          missingWarehouses.push(wh.name);
        }
      }

      if (missingWarehouses.length > 0) {
        const def = NOTIFICATION_DEFS.N01;
        notifications.push({
          code: 'N01',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${missingWarehouses.join('、')} 連續 3 天無 PMS 匯入紀錄`,
          count: missingWarehouses.length,
          targetUrl: def.targetUrl,
          metadata: { warehouses: missingWarehouses },
        });
      }
    } catch (err) {
      console.error('N01 calculation error:', err.message);
    }

    // ==============================
    // N02: 貸款還款日即將到來 - Loan repaymentDay within 3 days, no monthly record
    // ==============================
    try {
      const activeLoans = await prisma.loanMaster.findMany({
        where: { status: '使用中' },
        select: { id: true, loanName: true, repaymentDay: true, loanCode: true },
      });

      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();

      const upcomingLoans = [];
      for (const loan of activeLoans) {
        // Check if repaymentDay is within 3 days
        let repayDay = loan.repaymentDay;
        // Handle months with fewer days
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        if (repayDay > daysInMonth) repayDay = daysInMonth;

        const daysUntilRepayment = repayDay - currentDay;
        if (daysUntilRepayment >= 0 && daysUntilRepayment <= 3) {
          // Check if monthly record exists for this month
          const existingRecord = await prisma.loanMonthlyRecord.findFirst({
            where: {
              loanId: loan.id,
              recordYear: currentYear,
              recordMonth: currentMonth,
              status: { notIn: ['暫估'] },
            },
          });
          if (!existingRecord) {
            upcomingLoans.push(loan);
          }
        }
      }

      if (upcomingLoans.length > 0) {
        const def = NOTIFICATION_DEFS.N02;
        const loanNames = upcomingLoans.map(l => l.loanName).slice(0, 3).join('、');
        const suffix = upcomingLoans.length > 3 ? '...' : '';
        notifications.push({
          code: 'N02',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${upcomingLoans.length} 筆貸款還款日即將到來 (${loanNames}${suffix})`,
          count: upcomingLoans.length,
          targetUrl: def.targetUrl,
          metadata: { loanIds: upcomingLoans.map(l => l.id) },
        });
      }
    } catch (err) {
      console.error('N02 calculation error:', err.message);
    }

    // ==============================
    // N03: 支票即將到期 - Check status pending/due, dueDate within 3 days
    // ==============================
    try {
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];

      const dueSoonChecks = await prisma.check.findMany({
        where: {
          status: { in: ['pending', 'due', '待兌現'] },
          dueDate: {
            gte: todayStr,
            lte: threeDaysLaterStr,
          },
        },
        select: { id: true, checkNo: true, amount: true, dueDate: true },
      });

      if (dueSoonChecks.length > 0) {
        const totalAmount = dueSoonChecks.reduce((sum, c) => sum + Number(c.amount), 0);
        const def = NOTIFICATION_DEFS.N03;
        notifications.push({
          code: 'N03',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${dueSoonChecks.length} 張支票將在 3 天內到期，合計 NT$ ${totalAmount.toLocaleString()}`,
          count: dueSoonChecks.length,
          targetUrl: def.targetUrl,
          metadata: { totalAmount, checkIds: dueSoonChecks.map(c => c.id) },
        });
      }
    } catch (err) {
      console.error('N03 calculation error:', err.message);
    }

    // ==============================
    // N04: 支票已逾期未兌現 - Check dueDate < today, status not cleared/bounced/void
    // ==============================
    try {
      const overdueChecks = await prisma.check.findMany({
        where: {
          dueDate: { lt: todayStr },
          status: { notIn: ['cleared', 'bounced', 'void', '已兌現', '已退票', '已作廢'] },
        },
        select: { id: true, checkNo: true, amount: true, dueDate: true },
      });

      if (overdueChecks.length > 0) {
        const totalAmount = overdueChecks.reduce((sum, c) => sum + Number(c.amount), 0);
        const def = NOTIFICATION_DEFS.N04;
        notifications.push({
          code: 'N04',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${overdueChecks.length} 張支票已逾期未兌現，合計 NT$ ${totalAmount.toLocaleString()}`,
          count: overdueChecks.length,
          targetUrl: def.targetUrl,
          metadata: { totalAmount, checkIds: overdueChecks.map(c => c.id) },
        });
      }
    } catch (err) {
      console.error('N04 calculation error:', err.message);
    }

    // ==============================
    // N05: 付款單待出納 - PaymentOrder status='待出納'
    // ==============================
    try {
      const pendingOrders = await prisma.paymentOrder.findMany({
        where: { status: '待出納' },
        select: { id: true, orderNo: true, netAmount: true },
      });

      if (pendingOrders.length > 0) {
        const totalAmount = pendingOrders.reduce((sum, o) => sum + Number(o.netAmount), 0);
        const def = NOTIFICATION_DEFS.N05;
        notifications.push({
          code: 'N05',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${pendingOrders.length} 張付款單等待出納執行，合計 NT$ ${totalAmount.toLocaleString()}`,
          count: pendingOrders.length,
          targetUrl: def.targetUrl,
          metadata: { totalAmount },
        });
      }
    } catch (err) {
      console.error('N05 calculation error:', err.message);
    }

    // ==============================
    // N06: 付款單已退回 - PaymentOrder status='已拒絕'
    // ==============================
    try {
      const rejectedOrders = await prisma.paymentOrder.count({
        where: { status: '已拒絕' },
      });

      if (rejectedOrders > 0) {
        const def = NOTIFICATION_DEFS.N06;
        notifications.push({
          code: 'N06',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${rejectedOrders} 張付款單已被退回，需要修改後重新送出`,
          count: rejectedOrders,
          targetUrl: def.targetUrl,
          metadata: null,
        });
      }
    } catch (err) {
      console.error('N06 calculation error:', err.message);
    }

    // ==============================
    // N07: 貸款即將到期 - Loan endDate within 180 days, status='使用中'
    // ==============================
    try {
      const sixMonthsLater = new Date(today);
      sixMonthsLater.setDate(sixMonthsLater.getDate() + 180);
      const sixMonthsLaterStr = sixMonthsLater.toISOString().split('T')[0];

      const expiringLoans = await prisma.loanMaster.findMany({
        where: {
          status: '使用中',
          endDate: {
            gte: todayStr,
            lte: sixMonthsLaterStr,
          },
        },
        select: { id: true, loanName: true, endDate: true, currentBalance: true },
      });

      if (expiringLoans.length > 0) {
        const loanNames = expiringLoans.map(l => l.loanName).slice(0, 3).join('、');
        const suffix = expiringLoans.length > 3 ? '...' : '';
        const def = NOTIFICATION_DEFS.N07;
        notifications.push({
          code: 'N07',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${expiringLoans.length} 筆貸款將在 6 個月內到期 (${loanNames}${suffix})`,
          count: expiringLoans.length,
          targetUrl: def.targetUrl,
          metadata: { loanIds: expiringLoans.map(l => l.id) },
        });
      }
    } catch (err) {
      console.error('N07 calculation error:', err.message);
    }

    // ==============================
    // N08: 費用傳票待確認 - CommonExpenseRecord status='待確認'
    // ==============================
    try {
      const pendingExpenses = await prisma.commonExpenseRecord.count({
        where: { status: '待確認' },
      });

      if (pendingExpenses > 0) {
        const def = NOTIFICATION_DEFS.N08;
        notifications.push({
          code: 'N08',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${pendingExpenses} 筆常用費用傳票待確認`,
          count: pendingExpenses,
          targetUrl: def.targetUrl,
          metadata: null,
        });
      }
    } catch (err) {
      console.error('N08 calculation error:', err.message);
    }

    // ==============================
    // N09: 庫存偏低 - Product isInStock=true AND currentQuantity < minStockQty
    // ==============================
    try {
      // Check if Product model has minStockQty field by attempting a query
      // If the field doesn't exist, this will throw and we catch it
      let lowStockCount = 0;
      try {
        const lowStockProducts = await prisma.$queryRaw`
          SELECT COUNT(*) as cnt FROM products
          WHERE is_in_stock = true AND is_active = true
          AND min_stock_qty IS NOT NULL
          AND current_quantity < min_stock_qty
        `;
        lowStockCount = Number(lowStockProducts[0]?.cnt || 0);
      } catch {
        // minStockQty / currentQuantity columns may not exist yet, just count in-stock items as info
        // Skip this notification if the fields don't exist
        lowStockCount = 0;
      }

      if (lowStockCount > 0) {
        const def = NOTIFICATION_DEFS.N09;
        notifications.push({
          code: 'N09',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${lowStockCount} 項品項庫存低於安全庫存量`,
          count: lowStockCount,
          targetUrl: def.targetUrl,
          metadata: null,
        });
      }
    } catch (err) {
      console.error('N09 calculation error:', err.message);
    }

    // ==============================
    // N10: 月結未執行 - After 15th of month, previous month MonthEndStatus not '已鎖定'
    // ==============================
    try {
      const currentDay = today.getDate();
      if (currentDay > 15) {
        // Check previous month
        let prevYear = today.getFullYear();
        let prevMonth = today.getMonth(); // 0-indexed, so this is previous month (1-indexed)
        if (prevMonth === 0) {
          prevMonth = 12;
          prevYear -= 1;
        }

        // Check if MonthEndStatus for previous month is '已鎖定'
        const monthEndStatuses = await prisma.monthEndStatus.findMany({
          where: {
            year: prevYear,
            month: prevMonth,
          },
          select: { status: true, warehouse: true },
        });

        // Get all warehouses to check
        const warehouses = await prisma.warehouse.findMany({
          where: { isActive: true },
          select: { name: true },
        });

        const notLockedWarehouses = [];
        for (const wh of warehouses) {
          const whStatus = monthEndStatuses.find(s => s.warehouse === wh.name);
          if (!whStatus || whStatus.status !== '已鎖定') {
            notLockedWarehouses.push(wh.name);
          }
        }

        // Also check overall (null warehouse) status
        const overallStatus = monthEndStatuses.find(s => !s.warehouse);
        const hasOverallLock = overallStatus && overallStatus.status === '已鎖定';

        if (notLockedWarehouses.length > 0 || !hasOverallLock) {
          const def = NOTIFICATION_DEFS.N10;
          const detail = notLockedWarehouses.length > 0
            ? `${prevYear}/${prevMonth} 月結尚未完成 (${notLockedWarehouses.join('、')})`
            : `${prevYear}/${prevMonth} 月結尚未執行`;
          notifications.push({
            code: 'N10',
            type: def.type,
            level: def.level,
            title: def.title,
            message: detail,
            count: notLockedWarehouses.length || 1,
            targetUrl: def.targetUrl,
            metadata: { year: prevYear, month: prevMonth, warehouses: notLockedWarehouses },
          });
        }
      }
    } catch (err) {
      console.error('N10 calculation error:', err.message);
    }

    // ==============================
    // N11: PMS 貸借差異 - PmsImportBatch with difference > 100
    // ==============================
    try {
      const batchesWithDiff = await prisma.pmsImportBatch.findMany({
        where: {
          difference: { not: 0 },
        },
        select: { id: true, batchNo: true, warehouse: true, businessDate: true, difference: true },
        orderBy: { businessDate: 'desc' },
        take: 50,
      });

      // Filter for significant differences (abs > 100)
      const significantDiffs = batchesWithDiff.filter(b => Math.abs(Number(b.difference)) > 100);

      if (significantDiffs.length > 0) {
        const def = NOTIFICATION_DEFS.N11;
        notifications.push({
          code: 'N11',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${significantDiffs.length} 筆 PMS 匯入批次貸借不平衡 (差異 > 100)`,
          count: significantDiffs.length,
          targetUrl: def.targetUrl,
          metadata: { batchIds: significantDiffs.map(b => b.id) },
        });
      }
    } catch (err) {
      console.error('N11 calculation error:', err.message);
    }

    // ==============================
    // N12: 信用卡繳款到期 - unpaid/partial and due in 3 days
    // ==============================
    try {
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];

      const dueCreditCards = await prisma.creditCardStatement.findMany({
        where: {
          status: { in: ['pending', 'unpaid', 'partial'] },
          paymentDate: {
            gte: todayStr,
            lte: threeDaysLaterStr,
          },
        },
        select: {
          id: true,
          totalAmount: true,
          netAmount: true,
          paymentDate: true,
          status: true,
        },
      });

      if (dueCreditCards.length > 0) {
        const totalAmount = dueCreditCards.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
        const def = NOTIFICATION_DEFS.N12;
        notifications.push({
          code: 'N12',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `${dueCreditCards.length} 筆信用卡帳單 3 天內到期，待繳 NT$ ${totalAmount.toLocaleString()}`,
          count: dueCreditCards.length,
          targetUrl: def.targetUrl,
          metadata: { statementIds: dueCreditCards.map(s => s.id), totalAmount },
        });
      }
    } catch (err) {
      console.error('N12 calculation error:', err.message);
    }

    // ==============================
    // N13: 現金盤點逾期 - based on CashCountConfig.alertAfterDays
    // ==============================
    try {
      const cashAccounts = await prisma.cashAccount.findMany({
        where: {
          type: '現金',
          isActive: true,
        },
        select: { id: true, name: true, warehouse: true },
      });

      if (cashAccounts.length > 0) {
        const accountIds = cashAccounts.map(a => a.id);
        const configs = await prisma.cashCountConfig.findMany({
          where: { accountId: { in: accountIds } },
          select: { accountId: true, alertAfterDays: true },
        });
        const configMap = Object.fromEntries(configs.map(c => [c.accountId, c]));

        const latestCounts = await prisma.cashCount.groupBy({
          by: ['accountId'],
          where: { accountId: { in: accountIds } },
          _max: { countDate: true },
        });
        const latestMap = Object.fromEntries(
          latestCounts.map(c => [c.accountId, c._max.countDate])
        );

        const overdueAccounts = [];
        for (const acc of cashAccounts) {
          const latestDateStr = latestMap[acc.id];
          const alertAfterDays = configMap[acc.id]?.alertAfterDays ?? 1;
          if (!latestDateStr) {
            overdueAccounts.push(acc);
            continue;
          }
          const latestDate = new Date(`${latestDateStr}T00:00:00`);
          if (Number.isNaN(latestDate.getTime())) {
            overdueAccounts.push(acc);
            continue;
          }
          const daysSince = Math.floor((today.getTime() - latestDate.getTime()) / (24 * 60 * 60 * 1000));
          if (daysSince > alertAfterDays) {
            overdueAccounts.push(acc);
          }
        }

        if (overdueAccounts.length > 0) {
          const def = NOTIFICATION_DEFS.N13;
          const names = overdueAccounts.slice(0, 5).map(a => a.name).join('、');
          const suffix = overdueAccounts.length > 5 ? '...' : '';
          notifications.push({
            code: 'N13',
            type: def.type,
            level: def.level,
            title: def.title,
            message: `${overdueAccounts.length} 個現金帳戶逾期未盤點 (${names}${suffix})`,
            count: overdueAccounts.length,
            targetUrl: def.targetUrl,
            metadata: { accountIds: overdueAccounts.map(a => a.id) },
          });
        }
      }
    } catch (err) {
      console.error('N13 calculation error:', err.message);
    }

    // ==============================
    // N14: 備份失敗 / 驗證失敗
    // ==============================
    try {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [failedBackups, failedVerifications] = await Promise.all([
        prisma.backupRecord.count({
          where: {
            startedAt: { gte: sevenDaysAgo },
            status: { in: ['failed', 'corrupted'] },
          },
        }),
        prisma.backupRecord.count({
          where: {
            startedAt: { gte: sevenDaysAgo },
            verifyResult: 'failed',
          },
        }),
      ]);

      const totalIssues = failedBackups + failedVerifications;
      if (totalIssues > 0) {
        const def = NOTIFICATION_DEFS.N14;
        notifications.push({
          code: 'N14',
          type: def.type,
          level: def.level,
          title: def.title,
          message: `最近 7 天有 ${failedBackups} 筆備份失敗、${failedVerifications} 筆驗證失敗`,
          count: totalIssues,
          targetUrl: def.targetUrl,
          metadata: { failedBackups, failedVerifications, lookbackDays: 7 },
        });
      }
    } catch (err) {
      console.error('N14 calculation error:', err.message);
    }

    // Sort by level priority: critical > urgent > warning
    const levelOrder = { critical: 0, urgent: 1, warning: 2 };
    notifications.sort((a, b) => (levelOrder[a.level] ?? 99) - (levelOrder[b.level] ?? 99));

    // Build summary
    const summary = {
      total: notifications.reduce((sum, n) => sum + n.count, 0),
      critical: notifications.filter(n => n.level === 'critical').reduce((s, n) => s + n.count, 0),
      urgent: notifications.filter(n => n.level === 'urgent').reduce((s, n) => s + n.count, 0),
      warning: notifications.filter(n => n.level === 'warning').reduce((s, n) => s + n.count, 0),
    };

    return NextResponse.json({
      notifications,
      summary,
      calculatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

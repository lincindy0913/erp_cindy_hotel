import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { handleApiError } from '@/lib/error-handler';
import { localDateStr } from '@/lib/localDate';
import { calcBalanceDelta } from '@/lib/calc-balance-delta';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.MONTHEND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year  = parseInt(searchParams.get('year'));
    const month = parseInt(searchParams.get('month'));

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: '請提供有效的年份和月份' }, { status: 400 });
    }

    const monthStr   = String(month).padStart(2, '0');
    const ymStr      = `${year}-${monthStr}`;          // YYYY-MM
    const periodStart = `${ymStr}-01`;
    const lastDay    = new Date(year, month, 0).getDate();
    const periodEnd  = `${ymStr}-${String(lastDay).padStart(2, '0')}`;

    const items = [];

    // ── 1. 待入庫進貨 ──────────────────────────────────────────────
    try {
      const count = await prisma.purchaseMaster.count({
        where: { status: '待入庫', purchaseDate: { gte: periodStart, lte: periodEnd } },
      });
      items.push({
        key: 'pending_purchase', step: 1,
        label: '待入庫進貨',
        desc: count > 0 ? `當月有 ${count} 筆進貨單尚未入庫` : '當月進貨單已全數入庫',
        count, done: count === 0,
        status: count > 0 ? 'warning' : 'ok',
        href: '/purchasing', linkText: '前往進貨',
      });
    } catch {
      items.push({ key: 'pending_purchase', step: 1, label: '待入庫進貨', status: 'manual', href: '/purchasing', linkText: '前往進貨' });
    }

    // ── 2. 待核銷發票 ──────────────────────────────────────────────
    try {
      const count = await prisma.salesMaster.count({
        where: { status: '待核銷', invoiceDate: { gte: periodStart, lte: periodEnd } },
      });
      items.push({
        key: 'pending_invoice', step: 2,
        label: '待核銷發票',
        desc: count > 0 ? `當月有 ${count} 張發票尚未核銷` : '當月發票已全數核銷',
        count, done: count === 0,
        status: count > 0 ? 'warning' : 'ok',
        href: '/sales', linkText: '前往發票',
      });
    } catch {
      items.push({ key: 'pending_invoice', step: 2, label: '待核銷發票', status: 'manual', href: '/sales', linkText: '前往發票' });
    }

    // ── 3. 待出納付款單 ────────────────────────────────────────────
    try {
      const count = await prisma.paymentOrder.count({ where: { status: '待出納' } });
      items.push({
        key: 'pending_cashier', step: 3,
        label: '待出納付款單',
        desc: count > 0
          ? `${count} 張付款單已送出待出納確認（注意：此非指所有應付帳款，僅指已建立且尚未執行的付款單）`
          : '所有已建立付款單均已由出納執行完畢',
        count, done: count === 0,
        status: count > 0 ? 'warning' : 'ok',
        href: '/cashier', linkText: '前往出納',
      });
    } catch {
      items.push({ key: 'pending_cashier', step: 3, label: '待出納付款單', status: 'manual', href: '/cashier', linkText: '前往出納' });
    }

    // ── 4. PMS 已推送現金流 ────────────────────────────────────────
    try {
      // PmsMonthlySettlement: 待核對 → 已核對 → 已結算
      const settlements = await prisma.pmsMonthlySettlement.findMany({
        where: { settlementMonth: ymStr },
        select: { warehouse: true, status: true },
      });
      if (settlements.length === 0) {
        // Check if any PMS import batches exist for the month
        const batchCount = await prisma.pmsImportBatch.count({
          where: { businessDate: { gte: periodStart, lte: periodEnd } },
        });
        items.push({
          key: 'pms_pushed', step: 4,
          label: 'PMS 已推送現金流',
          desc: batchCount > 0
            ? `已匯入 ${batchCount} 筆 PMS 日報，月結算尚未建立`
            : '當月尚無 PMS 資料，請先匯入日報',
          count: batchCount,
          done: false,
          status: batchCount > 0 ? 'warning' : 'warning',
          href: '/pms-income', linkText: '前往 PMS 收入',
        });
      } else {
        const unsettled = settlements.filter(s => s.status !== '已結算');
        items.push({
          key: 'pms_pushed', step: 4,
          label: 'PMS 已推送現金流',
          desc: unsettled.length > 0
            ? `${unsettled.map(s => s.warehouse).join('、')} 月結算尚未完成（${unsettled[0].status}）`
            : '各館 PMS 月結算已完成',
          count: unsettled.length,
          done: unsettled.length === 0,
          status: unsettled.length > 0 ? 'warning' : 'ok',
          href: '/pms-income', linkText: '前往 PMS 收入',
        });
      }
    } catch {
      items.push({ key: 'pms_pushed', step: 4, label: 'PMS 已推送現金流', status: 'manual', href: '/pms-income', linkText: '前往 PMS 收入' });
    }

    // ── 5. 存簿核對 ────────────────────────────────────────────────
    try {
      const recons = await prisma.bankReconciliation.findMany({
        where: { statementYear: year, statementMonth: month },
        select: { status: true, difference: true },
      });
      if (recons.length === 0) {
        items.push({
          key: 'bank_recon', step: 5,
          label: '存簿核對',
          desc: '當月尚無存簿核對記錄，請先匯入銀行對帳單',
          done: false, status: 'manual',
          href: '/bank-reconciliation', linkText: '前往存簿核對',
        });
      } else {
        const unconfirmed = recons.filter(r => r.status !== 'confirmed');
        const hasDiff     = recons.filter(r => Math.abs(Number(r.difference)) > 0.01);
        const count       = unconfirmed.length + hasDiff.length;
        items.push({
          key: 'bank_recon', step: 5,
          label: '存簿核對',
          desc: count > 0
            ? `${unconfirmed.length > 0 ? `${unconfirmed.length} 個帳戶未確認` : ''}${hasDiff.length > 0 ? `，${hasDiff.length} 個帳戶仍有差異` : ''}`
            : '存簿核對完成，無差異',
          count,
          done: count === 0,
          status: count > 0 ? 'warning' : 'ok',
          href: '/bank-reconciliation', linkText: '前往存簿核對',
        });
      }
    } catch {
      items.push({ key: 'bank_recon', step: 5, label: '存簿核對', status: 'manual', href: '/bank-reconciliation', linkText: '前往存簿核對' });
    }

    // ── 6. 現金盤點 ────────────────────────────────────────────────
    try {
      const cashAccounts = await prisma.cashAccount.findMany({
        where: { type: '現金', isActive: true },
        select: { id: true, name: true },
      });
      if (cashAccounts.length === 0) {
        items.push({ key: 'cash_count', step: 6, label: '現金盤點', done: true, count: 0, status: 'ok', desc: '無現金帳戶', href: '/cashflow?tab=cash-count', linkText: '前往盤點' });
      } else {
        const completedCounts = await prisma.cashCount.findMany({
          where: {
            countDate: periodEnd,
            status: { in: ['confirmed', 'approved'] },
            accountId: { in: cashAccounts.map(a => a.id) },
          },
          select: { accountId: true },
        });
        const completedIds = new Set(completedCounts.map(c => c.accountId));
        const missing      = cashAccounts.filter(a => !completedIds.has(a.id));
        items.push({
          key: 'cash_count', step: 6,
          label: '現金盤點',
          desc: missing.length > 0
            ? `月底（${periodEnd}）盤點尚缺：${missing.slice(0, 3).map(a => a.name).join('、')}${missing.length > 3 ? '…' : ''}`
            : `月底（${periodEnd}）盤點已全數完成`,
          count: missing.length,
          done: missing.length === 0,
          status: missing.length > 0 ? 'warning' : 'ok',
          href: '/cashflow?tab=cash-count', linkText: '前往盤點',
        });
      }
    } catch {
      items.push({ key: 'cash_count', step: 6, label: '現金盤點', status: 'manual', href: '/cashflow?tab=cash-count', linkText: '前往盤點' });
    }

    // ── 7. 各館月結 → 全館月結 ────────────────────────────────────
    try {
      const activeBuildings = await prisma.warehouse.findMany({
        where: { type: 'building', isActive: true },
        select: { name: true },
      });

      const closedWarehouses = await prisma.monthEndStatus.findMany({
        where: {
          year, month,
          warehouse: activeBuildings.length > 0 ? { in: activeBuildings.map(w => w.name) } : undefined,
          status: { in: ['已結帳', '已鎖定'] },
        },
        select: { warehouse: true },
      });
      const closedSet = new Set(closedWarehouses.map(s => s.warehouse));
      const unclosed  = activeBuildings.filter(w => !closedSet.has(w.name));

      const globalClose = await prisma.monthEndStatus.findFirst({
        where: { year, month, warehouse: null, status: { in: ['已結帳', '已鎖定'] } },
      });

      const allDone    = unclosed.length === 0 && !!globalClose;
      const pendingCount = unclosed.length + (globalClose ? 0 : 1);

      items.push({
        key: 'warehouse_monthend', step: 7,
        label: '各館月結 → 全館月結',
        desc: unclosed.length > 0
          ? `${unclosed.map(w => w.name).join('、')} 尚未完成館別月結`
          : globalClose
            ? '各館及全館月結已完成'
            : '各館已完成，請執行全館月結',
        count: pendingCount,
        done: allDone,
        status: allDone ? 'ok' : 'warning',
        href: '/month-end', linkText: '前往月結',
        detail: unclosed.length > 0
          ? `未完成館別：${unclosed.map(w => w.name).join('、')}${!globalClose ? '；全館月結：尚未執行' : ''}`
          : !globalClose ? '全館月結：尚未執行' : null,
      });
    } catch {
      items.push({ key: 'warehouse_monthend', step: 7, label: '各館月結 → 全館月結', status: 'manual', href: '/month-end', linkText: '前往月結' });
    }

    // ── 8. 租屋已確認收款未入現金流 ──────────────────────────────────
    try {
      const count = await prisma.rentalIncome.count({
        where: {
          incomeYear: year,
          incomeMonth: month,
          status: 'confirmed',
          cashTransactionId: null,
        },
      });
      items.push({
        key: 'rental_income_unlinked', step: 8,
        label: '租屋已確認收款未入帳',
        desc: count > 0
          ? `${count} 筆已確認租金尚未建立現金流記錄，月結損益將有落差`
          : '當月確認收款均已連結現金流',
        count,
        done: count === 0,
        status: count > 0 ? 'warning' : 'ok',
        href: '/rentals?tab=income', linkText: '前往租屋收款',
      });
    } catch {
      items.push({ key: 'rental_income_unlinked', step: 8, label: '租屋已確認收款未入帳', status: 'manual', href: '/rentals?tab=income', linkText: '前往租屋收款' });
    }

    // ── 9. 工程估驗已核定未開票 ───────────────────────────────────────
    try {
      const certifiedClaims = await prisma.engineeringProgressClaim.findMany({
        where: {
          status: 'certified',
          certifiedDate: { gte: periodStart, lte: periodEnd },
        },
        include: {
          outputInvoices: { where: { status: { not: '已作廢' } }, select: { id: true } },
        },
      });
      const uninvoiced = certifiedClaims.filter(c => c.outputInvoices.length === 0);
      items.push({
        key: 'engineering_uninvoiced', step: 9,
        label: '工程估驗已核定未開票',
        desc: uninvoiced.length > 0
          ? `${uninvoiced.length} 筆已核定估驗尚未開立銷項發票`
          : '當月核定估驗均已開立發票（或當月無核定估驗）',
        count: uninvoiced.length,
        done: uninvoiced.length === 0,
        status: uninvoiced.length > 0 ? 'warning' : 'ok',
        href: '/engineering?tab=progressClaims', linkText: '前往估驗計價',
      });
    } catch {
      items.push({ key: 'engineering_uninvoiced', step: 9, label: '工程估驗已核定未開票', status: 'manual', href: '/engineering?tab=progressClaims', linkText: '前往估驗計價' });
    }

    // ── 10. 民宿各館鎖帳 ──────────────────────────────────────────
    try {
      const activeWhs = await prisma.bnbBookingRecord.groupBy({
        by: ['warehouse'],
        where: { importMonth: ymStr, status: { not: '已刪除' } },
      });
      if (activeWhs.length === 0) {
        items.push({
          key: 'bnb_month_lock', step: 10,
          label: '民宿各館鎖帳',
          desc: '當月無民宿訂房資料',
          count: 0, done: true, status: 'ok',
          href: '/bnb', linkText: '前往民宿帳',
        });
      } else {
        const lockedReports = await prisma.bnbMonthlyReport.findMany({
          where: { reportMonth: ymStr, lockedAt: { not: null } },
          select: { warehouse: true },
        });
        const lockedSet = new Set(lockedReports.map(r => r.warehouse));
        const unlocked = activeWhs.map(w => w.warehouse).filter(w => !lockedSet.has(w));
        items.push({
          key: 'bnb_month_lock', step: 10,
          label: '民宿各館鎖帳',
          desc: unlocked.length > 0
            ? `以下館別尚未鎖帳：${unlocked.join('、')}`
            : `所有館別（${activeWhs.length} 館）已完成鎖帳`,
          count: unlocked.length, done: unlocked.length === 0,
          status: unlocked.length > 0 ? 'warning' : 'ok',
          href: '/bnb', linkText: '前往民宿帳',
        });
      }
    } catch {
      items.push({ key: 'bnb_month_lock', step: 10, label: '民宿各館鎖帳', status: 'manual', href: '/bnb', linkText: '前往民宿帳' });
    }

    // ── 11. 民宿出納同步失敗 ──────────────────────────────────────
    try {
      const count = await prisma.bnbSyncFailure.count({ where: { resolved: false } });
      items.push({
        key: 'bnb_sync_failure', step: 11,
        label: '民宿出納同步失敗',
        desc: count > 0
          ? `${count} 筆民宿付款出納同步失敗，帳務可能不一致，月結前須先處理`
          : '民宿出納同步正常',
        count, done: count === 0,
        status: count > 0 ? 'warning' : 'ok',
        href: '/bnb', linkText: '前往民宿帳',
      });
    } catch {
      items.push({ key: 'bnb_sync_failure', step: 11, label: '民宿出納同步失敗', status: 'manual', href: '/bnb', linkText: '前往民宿帳' });
    }

    // ── 12. 損益科目未分類交易 ────────────────────────────────────
    try {
      const count = await prisma.cashTransaction.count({
        where: {
          transactionDate: { gte: periodStart, lte: periodEnd },
          categoryId: null,
          type: { in: ['收入', '支出'] },
        },
      });
      items.push({
        key: 'uncategorized_tx', step: 12,
        label: '損益科目未分類',
        desc: count > 0
          ? `當月有 ${count} 筆收支交易未設定損益科目，損益表將顯示為「未分類」，月結前建議補齊`
          : '當月交易損益科目已全數設定',
        count, done: count === 0,
        status: count > 0 ? 'warning' : 'ok',
        href: '/cashflow?tab=category-mgmt', linkText: '前往批次歸類',
      });
    } catch {
      items.push({ key: 'uncategorized_tx', step: 12, label: '損益科目未分類', status: 'manual', href: '/cashflow?tab=category-mgmt', linkText: '前往批次歸類' });
    }

    // ── 13. 草稿付款單（尚未送出）──────────────────────────────────
    try {
      const count = await prisma.paymentOrder.count({ where: { status: '草稿' } });
      items.push({
        key: 'draft_payment_orders', step: 13,
        label: '草稿付款單未送出',
        desc: count > 0
          ? `有 ${count} 張付款單仍為草稿，尚未送出出納，月結前請送出或刪除`
          : '無草稿付款單，全數已送出或處理',
        count, done: count === 0,
        status: count > 0 ? 'warning' : 'ok',
        href: '/cashier', linkText: '前往付款管理',
      });
    } catch {
      items.push({ key: 'draft_payment_orders', step: 13, label: '草稿付款單未送出', status: 'manual', href: '/cashier', linkText: '前往付款管理' });
    }

    // ── 14. 帳戶餘額與交易不一致 ──────────────────────────────────
    try {
      const cashAccounts = await prisma.cashAccount.findMany({
        where: { isActive: true },
        select: { id: true, name: true, openingBalance: true, currentBalance: true },
      });
      let mismatchCount = 0;
      const mismatchNames = [];
      for (const account of cashAccounts) {
        const txs = await prisma.cashTransaction.findMany({
          where: { accountId: account.id, status: '已確認' },
          select: { type: true, amount: true, fee: true, hasFee: true },
        });
        const expected = Number(account.openingBalance) + calcBalanceDelta(txs);
        if (Math.abs(expected - Number(account.currentBalance)) > 0.01) {
          mismatchCount++;
          mismatchNames.push(account.name);
        }
      }
      items.push({
        key: 'balance_mismatch', step: 14,
        label: '帳戶餘額與交易不一致',
        desc: mismatchCount > 0
          ? `${mismatchCount} 個帳戶餘額與交易加總不符（${mismatchNames.slice(0, 3).join('、')}${mismatchNames.length > 3 ? '…' : ''}），請使用「重算餘額」修正後再月結`
          : '所有帳戶餘額與交易加總一致',
        count: mismatchCount, done: mismatchCount === 0,
        status: mismatchCount > 0 ? 'warning' : 'ok',
        href: '/fund-management', linkText: '前往資金管理（重算餘額）',
      });
    } catch {
      items.push({ key: 'balance_mismatch', step: 14, label: '帳戶餘額與交易不一致', status: 'manual', href: '/fund-management', linkText: '前往資金管理' });
    }

    // ── 15. PMS 信用卡核對 ────────────────────────────────────────
    try {
      const count = await prisma.pmsReservationRecord.count({
        where: {
          businessDate: { gte: periodStart, lte: periodEnd },
          creditCard: { gt: 0 },
          creditCardStatus: { notIn: ['已核對', '已建帳', 'cc_已建帳'] },
        },
      });
      items.push({
        key: 'pms_cc_recon', step: 15,
        label: 'PMS 信用卡核對',
        desc: count > 0
          ? `當月有 ${count} 筆刷卡收款尚未核對，月結前請先完成信用卡對帳`
          : '當月 PMS 信用卡收款已全數核對',
        count, done: count === 0,
        status: count > 0 ? 'warning' : 'ok',
        href: '/pms-income?tab=creditCardStatement', linkText: '前往信用卡核對',
      });
    } catch {
      items.push({ key: 'pms_cc_recon', step: 15, label: 'PMS 信用卡核對', status: 'manual', href: '/pms-income?tab=creditCardStatement', linkText: '前往信用卡核對' });
    }

    // ── 16. PMS 訂金逾期未入（跨月） ─────────────────────────────
    try {
      const count = await prisma.pmsReservationRecord.count({
        where: { depositIn: { gt: 0 }, depositStatus: '逾期未入' },
      });
      items.push({
        key: 'pms_deposit_overdue', step: 16,
        label: 'PMS 訂金逾期未入',
        desc: count > 0
          ? `有 ${count} 筆訂金標記為「逾期未入」（跨月累計），請於月結前確認是否已入帳或處理`
          : '無訂金逾期未入',
        count, done: count === 0,
        status: count > 0 ? 'warning' : 'ok',
        href: '/pms-income?tab=depositRecon', linkText: '前往訂金核對',
      });
    } catch {
      items.push({ key: 'pms_deposit_overdue', step: 16, label: 'PMS 訂金逾期未入', status: 'manual', href: '/pms-income?tab=depositRecon', linkText: '前往訂金核對' });
    }

    const doneCount    = items.filter(i => i.done).length;
    const warningCount = items.filter(i => i.status === 'warning').length;

    return NextResponse.json({ year, month, items, doneCount, warningCount });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { handleApiError } from '@/lib/error-handler';
import { localDateStr } from '@/lib/localDate';

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
        desc: count > 0 ? `${count} 張付款單等待出納執行` : '所有付款單已執行完畢',
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

    const doneCount    = items.filter(i => i.done).length;
    const warningCount = items.filter(i => i.status === 'warning').length;

    return NextResponse.json({ year, month, items, doneCount, warningCount });
  } catch (error) {
    return handleApiError(error);
  }
}

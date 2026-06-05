import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { handleApiError } from '@/lib/error-handler';
import { localDateStr } from '@/lib/localDate';
import { getCached, setCached } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

const TTL = 3 * 60_000; // 3 minutes

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.NOTIFICATION_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const session   = auth.session;
    const userPerms = session?.user?.permissions || [];
    const role      = session?.user?.role || '';
    const userEmail = session?.user?.email || 'anon';

    const isAdminOrManager =
      role === 'admin' ||
      userPerms.includes('*') ||
      (session?.user?.roles || []).some(r => ['admin', 'manager'].includes(r));

    const cacheKey = `action-queue:${userEmail}`;
    const cached = getCached(cacheKey);
    if (cached) return NextResponse.json(cached.data);

    const hasPerm = (p) => isAdminOrManager || userPerms.includes(p);

    const today = new Date();
    const todayStr = localDateStr(today);
    const in7Days = new Date(today); in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = localDateStr(in7Days);
    const curYear  = today.getFullYear();
    const curMonth = today.getMonth() + 1;
    const monthStr = String(curMonth).padStart(2, '0');
    const periodStart = `${curYear}-${monthStr}-01`;
    const lastDay = new Date(curYear, curMonth, 0).getDate();
    const periodEnd = `${curYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const items = [];
    const tasks = [];

    // ── 採購 ────────────────────────────────────────────────────────
    if (hasPerm(PERMISSIONS.PURCHASING_VIEW)) {
      tasks.push((async () => {
        try {
          const [pendingWh, lowStock] = await Promise.all([
            prisma.purchaseMaster.count({ where: { status: '待入庫' } }),
            prisma.$queryRaw`SELECT COUNT(*) as cnt FROM inventory_low_stock_caches WHERE current_qty < threshold AND threshold > 0`,
          ]);
          if (pendingWh > 0) items.push({ key: 'pending_warehouse', category: '採購', label: '待入庫進貨', count: pendingWh, href: '/inventory?tab=inbound', urgency: 'high' });
          const low = Number(lowStock[0]?.cnt || 0);
          if (low > 0) items.push({ key: 'low_inventory', category: '採購', label: '庫存偏低品項', count: low, href: '/inventory?lowstock=1', urgency: 'normal' });
        } catch (e) { console.error('[action-queue] 採購:', e.message); }
      })());
    }

    // ── 財務 ────────────────────────────────────────────────────────
    if (hasPerm(PERMISSIONS.FINANCE_VIEW)) {
      tasks.push((async () => {
        try {
          const [draftPOs, monthInvoices, rejectedPOs] = await Promise.all([
            prisma.paymentOrder.count({ where: { status: '草稿' } }),
            prisma.salesMaster.count({
              where: { status: '待核銷', invoiceDate: { gte: periodStart, lte: periodEnd } },
            }),
            prisma.paymentOrder.count({ where: { status: '已拒絕' } }),
          ]);
          if (draftPOs > 0) items.push({ key: 'draft_po', category: '財務', label: '草稿付款單待送出', count: draftPOs, href: '/finance?tab=draft', urgency: 'high' });
          if (rejectedPOs > 0) items.push({ key: 'rejected_po', category: '財務', label: '被退回付款單', count: rejectedPOs, href: '/finance?tab=rejected', urgency: 'urgent' });
          if (monthInvoices > 0) items.push({ key: 'pending_invoices', category: '財務', label: '本月待核銷發票', count: monthInvoices, href: '/sales?status=待核銷', urgency: 'normal' });
        } catch (e) { console.error('[action-queue] 財務:', e.message); }
      })());
    }

    // ── 出納 ────────────────────────────────────────────────────────
    if (hasPerm(PERMISSIONS.CASHIER_VIEW) || hasPerm(PERMISSIONS.CASHIER_EXECUTE)) {
      tasks.push((async () => {
        try {
          const [pendingCashierList, dueChecks] = await Promise.all([
            prisma.paymentOrder.findMany({
              where: { status: '待出納' },
              select: { dueDate: true },
              orderBy: { dueDate: 'asc' },
              take: 1,
            }),
            prisma.paymentOrder.count({ where: { status: '待出納' } }),
          ]);
          const dueSoonChecks = await prisma.check.count({
            where: { status: { in: ['pending', 'due'] }, dueDate: { lte: in7DaysStr } },
          });
          if (dueChecks > 0) {
            const earliest = pendingCashierList[0]?.dueDate || null;
            const overdue = earliest && earliest < todayStr;
            items.push({
              key: 'pending_cashier', category: '出納',
              label: '待執行付款單', count: dueChecks, href: '/cashier',
              urgency: overdue ? 'urgent' : 'high',
              detail: earliest ? `最早到期：${earliest}` : null,
            });
          }
          if (dueSoonChecks > 0) {
            items.push({ key: 'due_checks', category: '出納', label: '本週到期支票', count: dueSoonChecks, href: '/checks', urgency: 'high' });
          }
        } catch (e) { console.error('[action-queue] 出納:', e.message); }
      })());
    }

    // ── 工程 ────────────────────────────────────────────────────────
    if (hasPerm(PERMISSIONS.ENGINEERING_VIEW)) {
      tasks.push((async () => {
        try {
          const [overdueTerms, dueTerms, draftEngPOs] = await Promise.all([
            prisma.engineeringContractTerm.count({
              where: { status: { notIn: ['paid', 'cancelled', 'void'] }, dueDate: { lt: todayStr, not: null } },
            }),
            prisma.engineeringContractTerm.count({
              where: {
                status: { notIn: ['paid', 'cancelled', 'void'] },
                dueDate: { gte: todayStr, lte: in7DaysStr },
              },
            }),
            prisma.paymentOrder.count({ where: { status: '草稿', sourceType: 'engineering' } }),
          ]);
          if (overdueTerms > 0) items.push({ key: 'overdue_eng', category: '工程', label: '逾期工程期數', count: overdueTerms, href: '/engineering?tab=contracts', urgency: 'urgent' });
          if (dueTerms > 0) items.push({ key: 'due_eng', category: '工程', label: '本週到期工程期數', count: dueTerms, href: '/engineering?tab=contracts', urgency: 'high' });
          if (draftEngPOs > 0) items.push({ key: 'draft_eng_po', category: '工程', label: '待送出工程付款單', count: draftEngPOs, href: '/engineering?tab=payments', urgency: 'normal' });
        } catch (e) { console.error('[action-queue] 工程:', e.message); }
      })());
    }

    // ── 主管 / 月結 ─────────────────────────────────────────────────
    if (isAdminOrManager || hasPerm(PERMISSIONS.MONTHEND_VIEW)) {
      tasks.push((async () => {
        try {
          const activeBuildings = await prisma.warehouse.findMany({
            where: { type: 'building', isActive: true },
            select: { name: true },
          });
          const [closedWh, globalClosed] = await Promise.all([
            activeBuildings.length > 0
              ? prisma.monthEndStatus.count({
                  where: {
                    year: curYear, month: curMonth,
                    warehouse: { in: activeBuildings.map(w => w.name) },
                    status: { in: ['已結帳', '已鎖定'] },
                  },
                })
              : Promise.resolve(0),
            prisma.monthEndStatus.count({
              where: { year: curYear, warehouse: null, status: { in: ['已結帳', '已鎖定'] } },
            }),
          ]);

          const unclosedWh = activeBuildings.length - closedWh;
          if (unclosedWh > 0) {
            items.push({
              key: 'unclosed_warehouses', category: '主管',
              label: `${curMonth} 月館別月結未完成`, count: unclosedWh,
              href: '/month-end', urgency: 'high',
            });
          }
          if (globalClosed < 12) {
            items.push({
              key: 'year_end_progress', category: '主管',
              label: '年結準備：月結進度', count: 12 - globalClosed,
              href: '/month-end', urgency: globalClosed >= 11 ? 'high' : 'normal',
              detail: `已完成 ${globalClosed}/12 月`,
            });
          }
        } catch (e) { console.error('[action-queue] 主管:', e.message); }
      })());
    }

    await Promise.all(tasks);

    // Sort: urgent(0) > high(1) > normal(2)
    const order = { urgent: 0, high: 1, normal: 2 };
    items.sort((a, b) => (order[a.urgency] ?? 9) - (order[b.urgency] ?? 9));

    const result = { items, generatedAt: new Date().toISOString() };
    setCached(cacheKey, result, TTL);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

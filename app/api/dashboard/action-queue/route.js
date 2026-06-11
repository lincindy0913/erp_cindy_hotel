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
    const ago30Days = new Date(today); ago30Days.setDate(ago30Days.getDate() - 30);
    const ago30DaysStr = localDateStr(ago30Days);
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
      // 待入庫（分逾期 >30天 / 一般）
      tasks.push((async () => {
        try {
          const [overdueWh, recentWh] = await Promise.all([
            prisma.purchaseMaster.count({ where: { status: '待入庫', purchaseDate: { lt: ago30DaysStr } } }),
            prisma.purchaseMaster.count({ where: { status: '待入庫', purchaseDate: { gte: ago30DaysStr } } }),
          ]);
          if (overdueWh > 0) items.push({ key: 'overdue_warehouse', category: '採購', label: '逾期待入庫（>30天）', count: overdueWh, href: '/inventory?tab=inbound', urgency: 'urgent' });
          if (recentWh > 0) items.push({ key: 'pending_warehouse', category: '採購', label: '待入庫進貨', count: recentWh, href: '/inventory?tab=inbound', urgency: 'high' });
        } catch (e) { console.error('[action-queue] 採購待入庫:', e.message); }
      })());
      // 低庫存（Prisma 不支援欄位對欄位比較，直接用 raw）
      tasks.push((async () => {
        try {
          const [r] = await prisma.$queryRaw`SELECT COUNT(*)::int AS cnt FROM inventory_low_stock_caches WHERE current_qty < threshold AND threshold > 0`;
          const low = Number(r?.cnt ?? 0);
          if (low > 0) items.push({ key: 'low_inventory', category: '採購', label: '庫存偏低品項', count: low, href: '/inventory?lowstock=1', urgency: 'normal' });
        } catch (e) { console.error('[action-queue] 低庫存:', e.message); }
      })());

      // 已入庫待辦：未建付款單 + 未核銷發票
      tasks.push((async () => {
        try {
          const delivered = await prisma.purchaseMaster.findMany({
            where: { status: '已入庫' },
            select: { id: true, details: { select: { id: true } } },
          });
          if (delivered.length === 0) return;

          const deliveredIds = delivered.map(p => p.id);

          // 未建付款單：已入庫且沒有任何有效付款單
          const [withPO, invoicedItems] = await Promise.all([
            prisma.paymentOrder.findMany({
              where: { sourceType: 'purchasing', sourceRecordId: { in: deliveredIds }, status: { not: '已作廢' } },
              select: { sourceRecordId: true },
              distinct: ['sourceRecordId'],
            }),
            prisma.salesDetail.findMany({
              where: { purchaseId: { in: deliveredIds } },
              select: { purchaseId: true, purchaseItemId: true },
            }),
          ]);

          const withPOSet = new Set(withPO.map(p => p.sourceRecordId));
          const unpaidCount = deliveredIds.filter(id => !withPOSet.has(id)).length;

          // 未核銷發票：已入庫且至少有一個品項未核銷
          const invoicedByPurchase = new Map();
          for (const item of invoicedItems) {
            if (!invoicedByPurchase.has(item.purchaseId)) invoicedByPurchase.set(item.purchaseId, new Set());
            invoicedByPurchase.get(item.purchaseId).add(item.purchaseItemId);
          }
          const uninvoicedCount = delivered.filter(p => {
            const inv = invoicedByPurchase.get(p.id) || new Set();
            if (p.details.length === 0) return !inv.has(`${p.id}-0`);
            return p.details.some(d => !inv.has(`${p.id}-${d.id}`));
          }).length;

          if (unpaidCount > 0) {
            items.push({ key: 'received_no_payment', category: '採購', label: '已入庫待建付款單', count: unpaidCount, href: '/finance', urgency: 'high' });
          }
          if (uninvoicedCount > 0) {
            items.push({ key: 'received_no_invoice', category: '採購', label: '已入庫未核銷發票', count: uninvoicedCount, href: '/purchasing', urgency: 'normal' });
          }
        } catch (e) { console.error('[action-queue] 採購已入庫待辦:', e.message); }
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
          const engPendingCashier = await prisma.paymentOrder.count({
            where: { status: '待出納', sourceType: 'engineering' },
          });
          if (overdueTerms > 0) items.push({ key: 'overdue_eng', category: '工程', label: '逾期工程期數', count: overdueTerms, href: '/engineering?tab=contracts', urgency: 'urgent' });
          if (dueTerms > 0) items.push({ key: 'due_eng', category: '工程', label: '本週到期工程期數', count: dueTerms, href: '/engineering?tab=contracts', urgency: 'high' });
          if (draftEngPOs > 0) items.push({ key: 'draft_eng_po', category: '工程', label: '待送出工程付款單', count: draftEngPOs, href: '/engineering?tab=payments', urgency: 'normal' });
          if (engPendingCashier > 0) items.push({ key: 'eng_pending_cashier', category: '工程', label: '工程付款待出納', count: engPendingCashier, href: '/cashier', urgency: 'high' });
        } catch (e) { console.error('[action-queue] 工程:', e.message); }
      })());
    }

    // ── 民宿 ─────────────────────────────────────────────────────────
    if (hasPerm(PERMISSIONS.BNB_VIEW)) {
      tasks.push((async () => {
        try {
          const syncFailures = await prisma.bnbSyncFailure.count({ where: { resolved: false } });
          if (syncFailures > 0) {
            items.push({
              key: 'bnb_sync_failures', category: '民宿',
              label: '出納同步失敗', count: syncFailures,
              href: '/bnb', urgency: 'urgent',
              detail: '請至民宿帳頁面逐筆重試',
            });
          }
        } catch (e) { console.error('[action-queue] 民宿同步失敗:', e.message); }
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

    // ── 租屋 ────────────────────────────────────────────────────────
    if (hasPerm(PERMISSIONS.RENTAL_VIEW)) {
      tasks.push((async () => {
        try {
          const [overdueRent, pendingContracts, activeContracts, existingIncomes] = await Promise.all([
            prisma.rentalIncome.count({
              where: { status: 'pending', dueDate: { lt: todayStr } },
            }),
            prisma.rentalContract.count({ where: { status: 'pending' } }),
            prisma.rentalContract.count({
              where: { status: 'active', startDate: { lte: periodEnd }, endDate: { gte: periodStart } },
            }),
            prisma.rentalIncome.count({ where: { incomeYear: curYear, incomeMonth: curMonth } }),
          ]);
          if (overdueRent > 0) {
            items.push({ key: 'rental_overdue', category: '租屋', label: '逾期未收租金', count: overdueRent, href: '/rentals?tab=cashier', urgency: 'urgent' });
          }
          if (pendingContracts > 0) {
            items.push({ key: 'rental_pending_contracts', category: '租屋', label: '待審核合約', count: pendingContracts, href: '/rentals?tab=contracts', urgency: 'high' });
          }
          const notGenerated = Math.max(0, activeContracts - existingIncomes);
          if (notGenerated > 0) {
            items.push({ key: 'rental_income_not_generated', category: '租屋', label: `${curMonth} 月租金尚未產生`, count: notGenerated, href: '/rentals?tab=cashier', urgency: 'normal' });
          }
        } catch (e) { console.error('[action-queue] 租屋:', e.message); }
      })());
    }

    // ── 資產 ────────────────────────────────────────────────────────
    if (hasPerm(PERMISSIONS.ASSET_VIEW)) {
      tasks.push((async () => {
        try {
          const unlinked = await prisma.rentalProperty.count({ where: { asset: null } });
          if (unlinked > 0) {
            items.push({ key: 'asset_unlinked_property', category: '資產', label: '物業未綁定資產', count: unlinked, href: '/assets', urgency: 'normal' });
          }
        } catch (e) { console.error('[action-queue] 資產:', e.message); }
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

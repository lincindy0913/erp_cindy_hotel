import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

// GET: 廠商損益表 — 依供應商彙總採購、退貨、費用
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate   = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse');

    // ── Purchase where ────────────────────────────────────────────
    const purchaseWhere = { status: { notIn: ['已作廢', '已退貨'] } };
    if (startDate || endDate) {
      purchaseWhere.purchaseDate = {};
      if (startDate) purchaseWhere.purchaseDate.gte = startDate;
      if (endDate)   purchaseWhere.purchaseDate.lte = endDate;
    }
    if (warehouse) purchaseWhere.warehouse = warehouse;
    const wf1 = applyWarehouseFilter(auth.session, purchaseWhere);
    if (!wf1.ok) return wf1.response;

    // ── Allowance (退貨) where ────────────────────────────────────
    const allowanceWhere = { status: '已確認' };
    if (startDate || endDate) {
      allowanceWhere.allowanceDate = {};
      if (startDate) allowanceWhere.allowanceDate.gte = startDate;
      if (endDate)   allowanceWhere.allowanceDate.lte = endDate;
    }
    if (warehouse) allowanceWhere.warehouse = warehouse;
    const wf2 = applyWarehouseFilter(auth.session, allowanceWhere);
    if (!wf2.ok) return wf2.response;

    // ── Expense where ─────────────────────────────────────────────
    const expenseWhere = { supplierId: { not: null } };
    if (startDate || endDate) {
      expenseWhere.invoiceDate = {};
      if (startDate) expenseWhere.invoiceDate.gte = startDate;
      if (endDate)   expenseWhere.invoiceDate.lte = endDate;
    }
    if (warehouse) expenseWhere.warehouse = warehouse;
    const wf3 = applyWarehouseFilter(auth.session, expenseWhere);
    if (!wf3.ok) return wf3.response;

    // ── Parallel queries ──────────────────────────────────────────
    const [purchases, allowances, expenses, suppliers] = await Promise.all([
      prisma.purchaseMaster.findMany({
        where: purchaseWhere,
        take: 50000,
        select: {
          supplierId: true,
          totalAmount: true,
          purchaseDate: true,
          warehouse: true,
          supplier: { select: { id: true, name: true } },
        },
      }),
      prisma.purchaseAllowance.findMany({
        where: allowanceWhere,
        take: 20000,
        select: { supplierId: true, supplierName: true, totalAmount: true, warehouse: true },
      }),
      prisma.expense.findMany({
        where: expenseWhere,
        take: 20000,
        select: { supplierId: true, supplierName: true, amount: true, warehouse: true },
      }),
      prisma.supplier.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // ── supplier map id → name ────────────────────────────────────
    const supplierNameMap = {};
    for (const s of suppliers) supplierNameMap[s.id] = s.name;

    // ── Aggregate per supplier ────────────────────────────────────
    const map = {}; // supplierId → { name, purchases, allowances, expenses }

    const getOrCreate = (id, name) => {
      if (!map[id]) map[id] = { supplierId: id, supplierName: name || supplierNameMap[id] || `廠商${id}`, purchases: 0, allowances: 0, expenses: 0 };
      return map[id];
    };

    for (const p of purchases) {
      if (!p.supplierId) continue;
      const name = p.supplier?.name || supplierNameMap[p.supplierId];
      getOrCreate(p.supplierId, name).purchases += Number(p.totalAmount);
    }
    for (const a of allowances) {
      if (!a.supplierId) continue;
      getOrCreate(a.supplierId, a.supplierName).allowances += Number(a.totalAmount);
    }
    for (const e of expenses) {
      if (!e.supplierId) continue;
      getOrCreate(e.supplierId, e.supplierName).expenses += Number(e.amount);
    }

    // ── Build result rows ─────────────────────────────────────────
    const rows = Object.values(map)
      .map(r => {
        const netPurchases = r.purchases - r.allowances; // 實際採購（扣退貨）
        const totalCost    = netPurchases + r.expenses;  // 總支出
        return {
          supplierId:    r.supplierId,
          supplierName:  r.supplierName,
          purchases:     Math.round(r.purchases),
          allowances:    Math.round(r.allowances),
          netPurchases:  Math.round(netPurchases),
          expenses:      Math.round(r.expenses),
          totalCost:     Math.round(totalCost),
        };
      })
      .sort((a, b) => b.totalCost - a.totalCost);

    const summary = {
      totalPurchases:   rows.reduce((s, r) => s + r.purchases, 0),
      totalAllowances:  rows.reduce((s, r) => s + r.allowances, 0),
      totalNetPurchases:rows.reduce((s, r) => s + r.netPurchases, 0),
      totalExpenses:    rows.reduce((s, r) => s + r.expenses, 0),
      totalCost:        rows.reduce((s, r) => s + r.totalCost, 0),
      supplierCount:    rows.length,
    };

    return NextResponse.json({ rows, summary });
  } catch (error) {
    return handleApiError(error);
  }
}

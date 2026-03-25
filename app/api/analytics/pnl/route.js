import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse');

    // Build date filters
    const pmsDateFilter = {};
    if (startDate) pmsDateFilter.gte = startDate;
    if (endDate) pmsDateFilter.lte = endDate;

    // === Revenue: sum PmsIncomeRecord credits ===
    const pmsWhere = { entryType: '貸方' };
    if (Object.keys(pmsDateFilter).length > 0) pmsWhere.businessDate = pmsDateFilter;
    if (warehouse) pmsWhere.warehouse = warehouse;

    const wf1 = applyWarehouseFilter(auth.session, pmsWhere);
    if (!wf1.ok) return wf1.response;

    const pmsRecords = await prisma.pmsIncomeRecord.findMany({
      where: pmsWhere,
      take: 50000,
      select: { businessDate: true, amount: true }
    });

    const revenue = pmsRecords.reduce((sum, r) => sum + Number(r.amount), 0);

    // === COGS: sum PurchaseMaster.totalAmount (exclude voided) ===
    const purchaseWhere = { status: { notIn: ['已作廢', '已退貨'] } };
    if (startDate || endDate) {
      purchaseWhere.purchaseDate = {};
      if (startDate) purchaseWhere.purchaseDate.gte = startDate;
      if (endDate) purchaseWhere.purchaseDate.lte = endDate;
    }
    if (warehouse) purchaseWhere.warehouse = warehouse;

    const wf2 = applyWarehouseFilter(auth.session, purchaseWhere);
    if (!wf2.ok) return wf2.response;

    const purchases = await prisma.purchaseMaster.findMany({
      where: purchaseWhere,
      take: 50000,
      select: { purchaseDate: true, totalAmount: true }
    });

    const rawCogs = purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);

    // === Purchase Allowances: deduct confirmed allowances from COGS ===
    const allowanceWhere = { status: '已確認' };
    if (startDate || endDate) {
      allowanceWhere.allowanceDate = {};
      if (startDate) allowanceWhere.allowanceDate.gte = startDate;
      if (endDate) allowanceWhere.allowanceDate.lte = endDate;
    }
    if (warehouse) allowanceWhere.warehouse = warehouse;

    const wf3 = applyWarehouseFilter(auth.session, allowanceWhere);
    if (!wf3.ok) return wf3.response;

    const allowances = await prisma.purchaseAllowance.findMany({
      where: allowanceWhere,
      take: 10000,
      select: { allowanceDate: true, totalAmount: true }
    });

    const totalAllowances = allowances.reduce((sum, a) => sum + Number(a.totalAmount), 0);
    const cogs = rawCogs - totalAllowances;

    // === Expenses: sum Expense.amount ===
    const expenseWhere = {};
    if (startDate || endDate) {
      expenseWhere.invoiceDate = {};
      if (startDate) expenseWhere.invoiceDate.gte = startDate;
      if (endDate) expenseWhere.invoiceDate.lte = endDate;
    }
    if (warehouse) expenseWhere.warehouse = warehouse;

    const wf4 = applyWarehouseFilter(auth.session, expenseWhere);
    if (!wf4.ok) return wf4.response;

    const expenses = await prisma.expense.findMany({
      where: expenseWhere,
      take: 50000,
      select: { invoiceDate: true, amount: true }
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // === Calculate summary ===
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - totalExpenses;

    // === Monthly breakdown ===
    const monthlyMap = {};

    // Helper to get YYYY-MM from date string
    const getMonth = (dateStr) => {
      if (!dateStr) return null;
      return dateStr.substring(0, 7); // YYYY-MM
    };

    for (const r of pmsRecords) {
      const m = getMonth(r.businessDate);
      if (!m) continue;
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, revenue: 0, cogs: 0, allowances: 0, expenses: 0 };
      monthlyMap[m].revenue += Number(r.amount);
    }

    for (const p of purchases) {
      const m = getMonth(p.purchaseDate);
      if (!m) continue;
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, revenue: 0, cogs: 0, allowances: 0, expenses: 0 };
      monthlyMap[m].cogs += Number(p.totalAmount);
    }

    for (const a of allowances) {
      const m = getMonth(a.allowanceDate);
      if (!m) continue;
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, revenue: 0, cogs: 0, allowances: 0, expenses: 0 };
      monthlyMap[m].allowances += Number(a.totalAmount);
    }

    for (const e of expenses) {
      const m = getMonth(e.invoiceDate);
      if (!m) continue;
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, revenue: 0, cogs: 0, allowances: 0, expenses: 0 };
      monthlyMap[m].expenses += Number(e.amount);
    }

    const monthly = Object.values(monthlyMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => {
        const netCogs = m.cogs - (m.allowances || 0);
        return {
          ...m,
          revenue: Math.round(m.revenue),
          cogs: Math.round(netCogs),
          allowances: Math.round(m.allowances || 0),
          expenses: Math.round(m.expenses),
          grossProfit: Math.round(m.revenue - netCogs),
          netProfit: Math.round(m.revenue - netCogs - m.expenses),
        };
      });

    return NextResponse.json({
      summary: {
        revenue: Math.round(revenue),
        cogs: Math.round(cogs),
        allowances: Math.round(totalAllowances),
        expenses: Math.round(totalExpenses),
        grossProfit: Math.round(grossProfit),
        netProfit: Math.round(netProfit)
      },
      monthly
    });
  } catch (error) {
    return handleApiError(error);
  }
}

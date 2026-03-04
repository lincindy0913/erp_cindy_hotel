import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
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

    const pmsRecords = await prisma.pmsIncomeRecord.findMany({
      where: pmsWhere,
      select: { businessDate: true, amount: true }
    });

    const revenue = pmsRecords.reduce((sum, r) => sum + Number(r.amount), 0);

    // === COGS: sum PurchaseMaster.totalAmount (exclude voided) ===
    const purchaseWhere = { status: { not: '已作廢' } };
    if (startDate || endDate) {
      purchaseWhere.purchaseDate = {};
      if (startDate) purchaseWhere.purchaseDate.gte = startDate;
      if (endDate) purchaseWhere.purchaseDate.lte = endDate;
    }
    if (warehouse) purchaseWhere.warehouse = warehouse;

    const purchases = await prisma.purchaseMaster.findMany({
      where: purchaseWhere,
      select: { purchaseDate: true, totalAmount: true }
    });

    const cogs = purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);

    // === Expenses: sum Expense.amount ===
    const expenseWhere = {};
    if (startDate || endDate) {
      expenseWhere.invoiceDate = {};
      if (startDate) expenseWhere.invoiceDate.gte = startDate;
      if (endDate) expenseWhere.invoiceDate.lte = endDate;
    }
    if (warehouse) expenseWhere.warehouse = warehouse;

    const expenses = await prisma.expense.findMany({
      where: expenseWhere,
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
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, revenue: 0, cogs: 0, expenses: 0 };
      monthlyMap[m].revenue += Number(r.amount);
    }

    for (const p of purchases) {
      const m = getMonth(p.purchaseDate);
      if (!m) continue;
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, revenue: 0, cogs: 0, expenses: 0 };
      monthlyMap[m].cogs += Number(p.totalAmount);
    }

    for (const e of expenses) {
      const m = getMonth(e.invoiceDate);
      if (!m) continue;
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, revenue: 0, cogs: 0, expenses: 0 };
      monthlyMap[m].expenses += Number(e.amount);
    }

    const monthly = Object.values(monthlyMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        revenue: Math.round(m.revenue),
        cogs: Math.round(m.cogs),
        expenses: Math.round(m.expenses),
        grossProfit: Math.round(m.revenue - m.cogs),
        netProfit: Math.round(m.revenue - m.cogs - m.expenses)
      }));

    return NextResponse.json({
      summary: {
        revenue: Math.round(revenue),
        cogs: Math.round(cogs),
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

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse');

    if (!startDate || !endDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供起始與結束日期', 400);
    }

    const where = {
      transactionDate: { gte: startDate, lte: endDate },
      type: { in: ['收入', '支出'] } // 移轉 excluded from report
    };
    if (warehouse) where.warehouse = warehouse;

    const transactions = await prisma.cashTransaction.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, type: true } },
        account: { select: { id: true, name: true, type: true, warehouse: true } }
      },
      orderBy: [{ transactionDate: 'asc' }, { type: 'asc' }]
    });

    // Group by category
    const incomeByCategory = {};
    const expenseByCategory = {};
    let totalIncome = 0;
    let totalExpense = 0;
    let totalFees = 0;

    for (const tx of transactions) {
      const amt = Number(tx.amount);
      const fee = tx.hasFee ? Number(tx.fee) : 0;
      const catName = tx.category?.name || '未分類';

      if (tx.type === '收入') {
        incomeByCategory[catName] = (incomeByCategory[catName] || 0) + amt;
        totalIncome += amt;
      } else if (tx.type === '支出') {
        expenseByCategory[catName] = (expenseByCategory[catName] || 0) + amt;
        totalExpense += amt;
        totalFees += fee;
      }
    }

    // Get opening balances for the period (balances at startDate)
    const accounts = await prisma.cashAccount.findMany({
      where: warehouse ? { warehouse, isActive: true } : { isActive: true }
    });

    // Get transactions before startDate to calculate opening period balance
    const priorWhere = {
      transactionDate: { lt: startDate }
    };
    if (warehouse) priorWhere.warehouse = warehouse;

    const netCashFlow = totalIncome - totalExpense - totalFees;

    return NextResponse.json({
      period: { startDate, endDate },
      warehouse: warehouse || '全部',
      incomeByCategory: Object.entries(incomeByCategory).map(([name, amount]) => ({
        name,
        amount: Math.round(amount * 100) / 100
      })).sort((a, b) => b.amount - a.amount),
      expenseByCategory: Object.entries(expenseByCategory).map(([name, amount]) => ({
        name,
        amount: Math.round(amount * 100) / 100
      })).sort((a, b) => b.amount - a.amount),
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100,
      netCashFlow: Math.round(netCashFlow * 100) / 100,
      transactionCount: transactions.length
    });
  } catch (error) {
    return handleApiError(error);
  }
}

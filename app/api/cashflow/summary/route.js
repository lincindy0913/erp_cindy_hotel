import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const days = parseInt(searchParams.get('days')) || 30;

    // Get all accounts
    const accountWhere = warehouse ? { warehouse, isActive: true } : { isActive: true };
    const accounts = await prisma.cashAccount.findMany({
      where: accountWhere,
      orderBy: [{ warehouse: 'asc' }, { type: 'asc' }]
    });

    // Get total balances by type
    const totalByType = {};
    const totalByWarehouse = {};
    let grandTotal = 0;

    for (const acc of accounts) {
      const bal = Number(acc.currentBalance);
      totalByType[acc.type] = (totalByType[acc.type] || 0) + bal;
      totalByWarehouse[acc.warehouse] = (totalByWarehouse[acc.warehouse] || 0) + bal;
      grandTotal += bal;
    }

    // Get daily transaction summary for last N days
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    const txWhere = {
      transactionDate: { gte: startDateStr, lte: todayStr }
    };
    if (warehouse) txWhere.warehouse = warehouse;

    const transactions = await prisma.cashTransaction.findMany({
      where: txWhere,
      select: {
        transactionDate: true,
        type: true,
        amount: true,
        fee: true,
        hasFee: true
      },
      orderBy: { transactionDate: 'asc' }
    });

    // Aggregate by date
    const dailySummary = {};
    for (const tx of transactions) {
      const date = tx.transactionDate;
      if (!dailySummary[date]) {
        dailySummary[date] = { date, income: 0, expense: 0, transfer: 0 };
      }
      const amt = Number(tx.amount);
      const fee = tx.hasFee ? Number(tx.fee) : 0;

      if (tx.type === '收入') {
        dailySummary[date].income += amt;
      } else if (tx.type === '支出') {
        dailySummary[date].expense += amt + fee;
      }
      // 移轉 not counted as income/expense
    }

    // Calculate forecast: project balance forward using average daily cashflow
    const totalIncome = transactions
      .filter(t => t.type === '收入')
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalExpense = transactions
      .filter(t => t.type === '支出')
      .reduce((s, t) => s + Number(t.amount) + (t.hasFee ? Number(t.fee) : 0), 0);

    const avgDailyNet = days > 0 ? (totalIncome - totalExpense) / days : 0;

    const forecast = [];
    let projectedBalance = grandTotal;
    for (let i = 1; i <= 30; i++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(forecastDate.getDate() + i);
      projectedBalance += avgDailyNet;
      forecast.push({
        date: forecastDate.toISOString().split('T')[0],
        projectedBalance: Math.round(projectedBalance * 100) / 100
      });
    }

    return NextResponse.json({
      accounts: accounts.map(a => ({
        ...a,
        openingBalance: Number(a.openingBalance),
        currentBalance: Number(a.currentBalance)
      })),
      totalByType,
      totalByWarehouse,
      grandTotal,
      dailySummary: Object.values(dailySummary),
      forecast,
      avgDailyNet: Math.round(avgDailyNet * 100) / 100,
      periodIncome: Math.round(totalIncome * 100) / 100,
      periodExpense: Math.round(totalExpense * 100) / 100
    });
  } catch (error) {
    return handleApiError(error);
  }
}

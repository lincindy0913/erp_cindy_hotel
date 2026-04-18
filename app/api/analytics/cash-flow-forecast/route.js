import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

// spec16 v5: Cash flow N-day forecast
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const endDate = new Date(today.getTime() + days * 86400000);
    const endDateStr = endDate.toISOString().split('T')[0];

    // Current cash balance
    const cashAccountWhere = { isActive: true };
    const wf1 = applyWarehouseFilter(auth.session, cashAccountWhere);
    if (!wf1.ok) return wf1.response;

    const cashAccounts = await prisma.cashAccount.findMany({
      where: cashAccountWhere,
      take: 1000,
      select: { id: true, name: true, currentBalance: true, type: true, warehouse: true },
    });
    const currentCash = cashAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);

    // Expected outflows: pending checks
    const checksPayableWhere = {
      checkType: 'payable',
      status: { in: ['pending', 'due'] },
      dueDate: { gte: todayStr, lte: endDateStr },
    };
    const wf2 = applyWarehouseFilter(auth.session, checksPayableWhere);
    if (!wf2.ok) return wf2.response;

    const pendingChecksPayable = await prisma.check.findMany({
      where: checksPayableWhere,
      take: 5000,
      select: { amount: true, dueDate: true, payeeName: true },
      orderBy: { dueDate: 'asc' },
    });

    // Expected outflows: loan repayments (from scheduled LoanMonthlyRecord)
    const loanMonthlyWhere = {
      dueDate: { gte: todayStr, lte: endDateStr },
      status: { notIn: ['已核實', '已預付'] },
    };

    const loanMonthlyRecords = await prisma.loanMonthlyRecord.findMany({
      where: loanMonthlyWhere,
      take: 1000,
      select: {
        id: true,
        dueDate: true,
        estimatedTotal: true,
        loan: { select: { loanName: true } },
      },
    });
    const loanRepayments = loanMonthlyRecords.map(r => ({
      id: r.id,
      loanName: r.loan?.loanName || '',
      monthlyPayment: Number(r.estimatedTotal || 0),
      dueDate: r.dueDate,
    }));

    // Expected inflows: pending checks receivable
    const checksReceivableWhere = {
      checkType: 'receivable',
      status: { in: ['pending', 'due'] },
      dueDate: { gte: todayStr, lte: endDateStr },
    };
    const wf3 = applyWarehouseFilter(auth.session, checksReceivableWhere);
    if (!wf3.ok) return wf3.response;

    const pendingChecksReceivable = await prisma.check.findMany({
      where: checksReceivableWhere,
      take: 5000,
      select: { amount: true, dueDate: true, drawerName: true },
      orderBy: { dueDate: 'asc' },
    });

    // Expected inflows: rental income
    const pendingRentalIncome = await prisma.rentalIncome.findMany({
      where: {
        status: { in: ['pending', 'overdue'] },
        dueDate: { gte: todayStr, lte: endDateStr },
      },
      take: 5000,
      select: { expectedAmount: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    });

    // Calculate daily forecast
    const totalOutflow = pendingChecksPayable.reduce((sum, c) => sum + Number(c.amount || 0), 0)
      + loanRepayments.reduce((sum, l) => sum + Number(l.monthlyPayment || 0), 0);
    const totalInflow = pendingChecksReceivable.reduce((sum, c) => sum + Number(c.amount || 0), 0)
      + pendingRentalIncome.reduce((sum, r) => sum + Number(r.expectedAmount || 0), 0);

    const predictedBalance = currentCash + totalInflow - totalOutflow;
    const minBalance = Math.min(currentCash, predictedBalance);

    // Risk assessment
    let riskLevel = 'low';
    if (minBalance < 0) riskLevel = 'critical';
    else if (minBalance < 100000) riskLevel = 'high';
    else if (minBalance < 500000) riskLevel = 'medium';

    // Three scenario modeling
    const scenarios = {
      optimistic: {
        label: '樂觀情境（正常回款）',
        predictedBalance,
        description: '所有應收款按期收回',
      },
      risk: {
        label: '風險情境（AR延遲5天）',
        predictedBalance: currentCash + totalInflow * 0.85 - totalOutflow,
        description: '應收款延遲5天，部分未收回',
      },
      crisis: {
        label: '危機情境（AR延遲10天+加速付款）',
        predictedBalance: currentCash + totalInflow * 0.7 - totalOutflow * 1.1,
        description: '應收款大幅延遲，供應商加速扣款',
      },
    };

    return NextResponse.json({
      currentCash,
      forecastDays: days,
      totalExpectedInflow: totalInflow,
      totalExpectedOutflow: totalOutflow,
      predictedBalance,
      minBalance,
      riskLevel,
      scenarios,
      outflows: {
        checks: pendingChecksPayable.map(c => ({ ...c, amount: Number(c.amount) })),
        loans: loanRepayments.map(l => ({ ...l, monthlyPayment: Number(l.monthlyPayment || 0) })),
      },
      inflows: {
        checks: pendingChecksReceivable.map(c => ({ ...c, amount: Number(c.amount) })),
        rentals: pendingRentalIncome.map(r => ({ ...r, expectedAmount: Number(r.expectedAmount || 0) })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

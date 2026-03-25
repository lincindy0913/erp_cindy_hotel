import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    // Get all active loans
    const loanWhere = { status: '使用中' };
    const wf = applyWarehouseFilter(auth.session, loanWhere);
    if (!wf.ok) return wf.response;

    const loans = await prisma.loanMaster.findMany({
      where: loanWhere,
      take: 1000,
      include: {
        monthlyRecords: {
          orderBy: [{ recordYear: 'asc' }, { recordMonth: 'asc' }],
          take: 120
        }
      }
    });

    // === Total outstanding balance ===
    const totalDebt = loans.reduce((sum, l) => sum + Number(l.currentBalance), 0);

    // === Debt structure by bank ===
    const bankMap = {};
    for (const loan of loans) {
      const bank = loan.bankName || '未知銀行';
      if (!bankMap[bank]) bankMap[bank] = { bank, amount: 0, count: 0 };
      bankMap[bank].amount += Number(loan.currentBalance);
      bankMap[bank].count += 1;
    }

    const structure = Object.values(bankMap)
      .sort((a, b) => b.amount - a.amount)
      .map(s => ({
        ...s,
        amount: Math.round(s.amount),
        percentage: totalDebt > 0 ? Math.round((s.amount / totalDebt) * 10000) / 100 : 0
      }));

    // === Monthly repayment pressure (next 12 months) ===
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    const monthlyPressure = [];
    for (let i = 0; i < 12; i++) {
      let y = currentYear;
      let m = currentMonth + i;
      if (m > 12) { y += 1; m -= 12; }

      const monthLabel = `${y}-${String(m).padStart(2, '0')}`;
      let principal = 0;
      let interest = 0;

      for (const loan of loans) {
        for (const record of loan.monthlyRecords) {
          if (record.recordYear === y && record.recordMonth === m) {
            principal += Number(record.actualPrincipal || record.estimatedPrincipal || 0);
            interest += Number(record.actualInterest || record.estimatedInterest || 0);
          }
        }
      }

      monthlyPressure.push({
        month: monthLabel,
        principal: Math.round(principal),
        interest: Math.round(interest),
        total: Math.round(principal + interest)
      });
    }

    // === Weighted average interest rate ===
    let weightedRateSum = 0;
    let totalBalance = 0;
    for (const loan of loans) {
      const bal = Number(loan.currentBalance);
      const rate = Number(loan.annualRate);
      weightedRateSum += bal * rate;
      totalBalance += bal;
    }
    const avgRate = totalBalance > 0 ? Math.round((weightedRateSum / totalBalance) * 10000) / 10000 : 0;

    // === Loans expiring within 6 months ===
    const sixMonthsLater = new Date(today);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const sixMonthsStr = sixMonthsLater.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    const expiringSoon = loans
      .filter(l => l.endDate && l.endDate >= todayStr && l.endDate <= sixMonthsStr)
      .map(l => ({
        id: l.id,
        loanCode: l.loanCode,
        loanName: l.loanName,
        bankName: l.bankName,
        currentBalance: Math.round(Number(l.currentBalance)),
        annualRate: Number(l.annualRate),
        endDate: l.endDate,
        daysRemaining: Math.floor((new Date(l.endDate) - today) / (1000 * 60 * 60 * 24))
      }))
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    return NextResponse.json({
      totalDebt: Math.round(totalDebt),
      structure,
      monthlyPressure,
      avgRate,
      expiringSoon,
      totalLoans: loans.length
    });
  } catch (error) {
    return handleApiError(error);
  }
}

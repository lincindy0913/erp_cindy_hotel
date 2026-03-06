import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.LOAN_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.year || !data.month || !data.loanIds || !Array.isArray(data.loanIds) || data.loanIds.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '年份、月份、貸款ID列表為必填', 400);
    }

    const year = parseInt(data.year);
    const month = parseInt(data.month);
    const loanIds = data.loanIds.map(id => parseInt(id));

    // Get all target loans
    const loans = await prisma.loanMaster.findMany({
      where: {
        id: { in: loanIds },
        status: '使用中'
      }
    });

    if (loans.length === 0) {
      return createErrorResponse('LOAN_ACCOUNT_NOT_FOUND', '找不到有效的貸款', 404);
    }

    // Check which records already exist
    const existingRecords = await prisma.loanMonthlyRecord.findMany({
      where: {
        loanId: { in: loanIds },
        recordYear: year,
        recordMonth: month
      },
      select: { loanId: true }
    });

    const existingLoanIds = new Set(existingRecords.map(r => r.loanId));

    const created = [];
    const skipped = [];

    for (const loan of loans) {
      if (existingLoanIds.has(loan.id)) {
        skipped.push({ loanId: loan.id, loanName: loan.loanName, reason: '記錄已存在' });
        continue;
      }

      // Calculate estimated amounts based on loan info
      const currentBalance = Number(loan.currentBalance);
      const annualRate = Number(loan.annualRate);
      const monthlyInterest = Math.round(currentBalance * (annualRate / 100) / 12);

      // For principal estimation, use a simple approach:
      // Total months remaining from loan term, divide remaining balance
      let estimatedPrincipal = 0;
      if (loan.endDate) {
        const endDate = new Date(loan.endDate);
        const currentDate = new Date(year, month - 1, 1);
        const monthsRemaining = Math.max(1, (endDate.getFullYear() - currentDate.getFullYear()) * 12 + (endDate.getMonth() - currentDate.getMonth()));
        estimatedPrincipal = Math.round(currentBalance / monthsRemaining);
      }

      const repDay = Math.min(loan.repaymentDay, 28);
      const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(repDay).padStart(2, '0')}`;

      const record = await prisma.loanMonthlyRecord.create({
        data: {
          loanId: loan.id,
          recordYear: year,
          recordMonth: month,
          dueDate,
          status: '暫估',
          estimatedPrincipal,
          estimatedInterest: monthlyInterest,
          estimatedTotal: estimatedPrincipal + monthlyInterest,
          estimatedAt: new Date(),
          deductAccountId: loan.deductAccountId
        }
      });

      created.push({
        ...record,
        estimatedPrincipal: Number(record.estimatedPrincipal),
        estimatedInterest: Number(record.estimatedInterest),
        estimatedTotal: Number(record.estimatedTotal),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString()
      });
    }

    return NextResponse.json({
      created: created.length,
      skipped: skipped.length,
      records: created,
      skippedDetails: skipped
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

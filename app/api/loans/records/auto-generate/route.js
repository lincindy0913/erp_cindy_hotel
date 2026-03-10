import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// POST: Auto-generate current month records for all active loans
// Called automatically when monthly tab loads — equivalent to batch create
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.LOAN_CREATE, PERMISSIONS.LOAN_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const now = new Date();
    const year = body.year || now.getFullYear();
    const month = body.month || (now.getMonth() + 1);

    // Get all active loans
    const loans = await prisma.loanMaster.findMany({
      where: { status: '使用中' }
    });

    if (loans.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0, records: [] });
    }

    // Check which records already exist
    const existing = await prisma.loanMonthlyRecord.findMany({
      where: {
        loanId: { in: loans.map(l => l.id) },
        recordYear: year,
        recordMonth: month
      },
      select: { loanId: true }
    });
    const existingIds = new Set(existing.map(r => r.loanId));

    const created = [];
    const skipped = [];

    for (const loan of loans) {
      if (existingIds.has(loan.id)) {
        skipped.push({ loanId: loan.id, loanName: loan.loanName });
        continue;
      }

      const currentBalance = Number(loan.currentBalance);
      const annualRate = Number(loan.annualRate);
      const monthlyInterest = Math.round(currentBalance * (annualRate / 100) / 12);

      let estimatedPrincipal = 0;
      if (loan.endDate) {
        const endDate = new Date(loan.endDate);
        const currentDate = new Date(year, month - 1, 1);
        const monthsRemaining = Math.max(1,
          (endDate.getFullYear() - currentDate.getFullYear()) * 12 +
          (endDate.getMonth() - currentDate.getMonth())
        );
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
      records: created
    });
  } catch (error) {
    return handleApiError(error);
  }
}

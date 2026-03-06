import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.LOAN_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const loanId = searchParams.get('loanId');

    const where = {};
    if (loanId) where.loanId = parseInt(loanId);

    const histories = await prisma.loanRateHistory.findMany({
      where,
      include: {
        loan: {
          select: { loanCode: true, loanName: true }
        }
      },
      orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }]
    });

    const result = histories.map(h => ({
      ...h,
      annualRate: Number(h.annualRate),
      createdAt: h.createdAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.LOAN_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.loanId || data.annualRate === undefined || !data.effectiveDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '貸款ID、年利率、生效日期為必填', 400);
    }

    const loanId = parseInt(data.loanId);
    const annualRate = parseFloat(data.annualRate);

    const loan = await prisma.loanMaster.findUnique({ where: { id: loanId } });
    if (!loan) {
      return createErrorResponse('LOAN_ACCOUNT_NOT_FOUND', '貸款不存在', 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create rate history record
      const history = await tx.loanRateHistory.create({
        data: {
          loanId,
          annualRate,
          effectiveDate: data.effectiveDate,
          note: data.note || null
        }
      });

      // Update LoanMaster.annualRate
      await tx.loanMaster.update({
        where: { id: loanId },
        data: { annualRate }
      });

      return history;
    });

    return NextResponse.json({
      ...result,
      annualRate: Number(result.annualRate),
      createdAt: result.createdAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

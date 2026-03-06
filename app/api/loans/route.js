import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Generate loan code: LN-YYYYMM-XXX
async function generateLoanCode() {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `LN-${ym}-`;

  const existing = await prisma.loanMaster.findMany({
    where: { loanCode: { startsWith: prefix } },
    select: { loanCode: true }
  });

  let maxSeq = 0;
  for (const l of existing) {
    const seq = parseInt(l.loanCode.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.LOAN_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const status = searchParams.get('status');
    const ownerType = searchParams.get('ownerType');

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (status) where.status = status;
    if (ownerType) where.ownerType = ownerType;

    const loans = await prisma.loanMaster.findMany({
      where,
      include: {
        deductAccount: {
          select: { id: true, name: true, type: true, warehouse: true }
        },
        monthlyRecords: {
          orderBy: [{ recordYear: 'desc' }, { recordMonth: 'desc' }],
          take: 1,
          select: {
            id: true,
            recordYear: true,
            recordMonth: true,
            status: true,
            estimatedTotal: true,
            actualTotal: true,
            dueDate: true
          }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    const result = loans.map(l => ({
      ...l,
      originalAmount: Number(l.originalAmount),
      currentBalance: Number(l.currentBalance),
      annualRate: Number(l.annualRate),
      latestRecord: l.monthlyRecords[0] || null,
      monthlyRecords: undefined,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString()
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

    if (!data.loanName || !data.ownerType || !data.bankName || !data.originalAmount || !data.annualRate || !data.startDate || !data.endDate || !data.repaymentType || !data.repaymentDay || !data.deductAccountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '貸款名稱、持有人類型、銀行名稱、貸款金額、年利率、起迄日、還款方式、還款日、扣款帳戶為必填', 400);
    }

    const loanCode = await generateLoanCode();
    const originalAmount = parseFloat(data.originalAmount);

    const result = await prisma.$transaction(async (tx) => {
      const loan = await tx.loanMaster.create({
        data: {
          loanCode,
          loanName: data.loanName,
          ownerType: data.ownerType,
          ownerName: data.ownerName || null,
          warehouse: data.warehouse || null,
          bankName: data.bankName,
          bankBranch: data.bankBranch || null,
          loanType: data.loanType || '一般貸款',
          originalAmount,
          currentBalance: originalAmount,
          annualRate: parseFloat(data.annualRate),
          rateType: data.rateType || '固定利率',
          repaymentType: data.repaymentType,
          repaymentDay: parseInt(data.repaymentDay),
          startDate: data.startDate,
          endDate: data.endDate,
          deductAccountId: parseInt(data.deductAccountId),
          principalSubjectId: data.principalSubjectId ? parseInt(data.principalSubjectId) : null,
          interestSubjectId: data.interestSubjectId ? parseInt(data.interestSubjectId) : null,
          autoDebit: data.autoDebit !== undefined ? data.autoDebit : true,
          contactPerson: data.contactPerson || null,
          contactPhone: data.contactPhone || null,
          remark: data.remark || null,
          status: '使用中',
          sortOrder: data.sortOrder || 0
        }
      });

      // Create initial rate history record
      await tx.loanRateHistory.create({
        data: {
          loanId: loan.id,
          annualRate: parseFloat(data.annualRate),
          effectiveDate: data.startDate,
          note: '初始利率'
        }
      });

      return loan;
    });

    return NextResponse.json({
      ...result,
      originalAmount: Number(result.originalAmount),
      currentBalance: Number(result.currentBalance),
      annualRate: Number(result.annualRate),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

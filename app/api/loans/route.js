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
  const auth = await requireAnyPermission([PERMISSIONS.LOAN_CREATE, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.loanName || !String(data.loanName).trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫貸款名稱', 400);
    }
    if (!data.bankName || !String(data.bankName).trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫銀行名稱', 400);
    }
    const originalAmount = parseFloat(data.originalAmount);
    if (isNaN(originalAmount) || originalAmount <= 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫有效的貸款金額', 400);
    }
    const annualRate = parseFloat(data.annualRate);
    if (data.annualRate !== '' && data.annualRate !== null && data.annualRate !== undefined && isNaN(annualRate)) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫有效的年利率', 400);
    }
    if (!data.startDate) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇起日', 400);
    if (!data.endDate) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇迄日', 400);
    if (!data.repaymentType) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇還款方式', 400);
    if (!data.deductAccountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇扣款帳戶（請至設定或現金流管理新增存簿）', 400);
    }

    const loanCode = await generateLoanCode();
    const rateNum = parseFloat(data.annualRate);
    const repaymentDayNum = parseInt(data.repaymentDay, 10) || 1;

    const result = await prisma.$transaction(async (tx) => {
      const loan = await tx.loanMaster.create({
        data: {
          loanCode,
          loanName: String(data.loanName).trim(),
          ownerType: data.ownerType || '公司',
          ownerName: data.ownerName && String(data.ownerName).trim() ? String(data.ownerName).trim() : null,
          warehouse: data.warehouse && String(data.warehouse).trim() ? String(data.warehouse).trim() : null,
          bankName: String(data.bankName).trim(),
          bankBranch: data.bankBranch && String(data.bankBranch).trim() ? String(data.bankBranch).trim() : null,
          loanType: data.loanType || '一般貸款',
          originalAmount,
          currentBalance: originalAmount,
          annualRate: isNaN(rateNum) ? 0 : rateNum,
          rateType: data.rateType || '固定利率',
          repaymentType: data.repaymentType || '本息攤還',
          repaymentDay: repaymentDayNum,
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
          sortOrder: parseInt(data.sortOrder) || 0
        }
      });

      // Create initial rate history record
      const rateForHistory = parseFloat(data.annualRate);
      await tx.loanRateHistory.create({
        data: {
          loanId: loan.id,
          annualRate: isNaN(rateForHistory) ? 0 : rateForHistory,
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

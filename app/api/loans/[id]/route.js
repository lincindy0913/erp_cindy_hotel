import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.LOAN_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const loan = await prisma.loanMaster.findUnique({
      where: { id },
      include: {
        deductAccount: {
          select: { id: true, name: true, type: true, warehouse: true }
        },
        rateHistories: {
          orderBy: { effectiveDate: 'desc' }
        },
        notes: {
          orderBy: { createdAt: 'desc' }
        },
        monthlyRecords: {
          orderBy: [{ recordYear: 'desc' }, { recordMonth: 'desc' }],
          take: 1
        }
      }
    });

    if (!loan) {
      return createErrorResponse('NOT_FOUND', '貸款不存在', 404);
    }

    return NextResponse.json({
      ...loan,
      originalAmount: Number(loan.originalAmount),
      currentBalance: Number(loan.currentBalance),
      annualRate: Number(loan.annualRate),
      rateHistories: loan.rateHistories.map(r => ({
        ...r,
        annualRate: Number(r.annualRate),
        createdAt: r.createdAt.toISOString()
      })),
      notes: loan.notes.map(n => ({
        ...n,
        createdAt: n.createdAt.toISOString()
      })),
      currentMonthRecord: loan.monthlyRecords[0] ? {
        ...loan.monthlyRecords[0],
        estimatedPrincipal: Number(loan.monthlyRecords[0].estimatedPrincipal),
        estimatedInterest: Number(loan.monthlyRecords[0].estimatedInterest),
        estimatedTotal: Number(loan.monthlyRecords[0].estimatedTotal),
        actualPrincipal: loan.monthlyRecords[0].actualPrincipal ? Number(loan.monthlyRecords[0].actualPrincipal) : null,
        actualInterest: loan.monthlyRecords[0].actualInterest ? Number(loan.monthlyRecords[0].actualInterest) : null,
        actualTotal: loan.monthlyRecords[0].actualTotal ? Number(loan.monthlyRecords[0].actualTotal) : null,
        createdAt: loan.monthlyRecords[0].createdAt.toISOString(),
        updatedAt: loan.monthlyRecords[0].updatedAt.toISOString()
      } : null,
      monthlyRecords: undefined,
      createdAt: loan.createdAt.toISOString(),
      updatedAt: loan.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.LOAN_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.loanMaster.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '貸款不存在', 404);
    }

    const updateData = {};
    if (data.loanName !== undefined) updateData.loanName = data.loanName;
    if (data.ownerType !== undefined) updateData.ownerType = data.ownerType;
    if (data.ownerName !== undefined) updateData.ownerName = data.ownerName || null;
    if (data.warehouse !== undefined) updateData.warehouse = data.warehouse || null;
    if (data.bankName !== undefined) updateData.bankName = data.bankName;
    if (data.bankBranch !== undefined) updateData.bankBranch = data.bankBranch || null;
    if (data.loanType !== undefined) updateData.loanType = data.loanType;
    if (data.annualRate !== undefined) updateData.annualRate = parseFloat(data.annualRate);
    if (data.rateType !== undefined) updateData.rateType = data.rateType;
    if (data.repaymentType !== undefined) updateData.repaymentType = data.repaymentType;
    if (data.repaymentDay !== undefined) updateData.repaymentDay = parseInt(data.repaymentDay);
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.endDate !== undefined) updateData.endDate = data.endDate;
    if (data.deductAccountId !== undefined) updateData.deductAccountId = parseInt(data.deductAccountId);
    if (data.principalSubjectId !== undefined) updateData.principalSubjectId = data.principalSubjectId ? parseInt(data.principalSubjectId) : null;
    if (data.interestSubjectId !== undefined) updateData.interestSubjectId = data.interestSubjectId ? parseInt(data.interestSubjectId) : null;
    if (data.autoDebit !== undefined) updateData.autoDebit = data.autoDebit;
    if (data.contactPerson !== undefined) updateData.contactPerson = data.contactPerson || null;
    if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone || null;
    if (data.remark !== undefined) updateData.remark = data.remark || null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.sortOrder !== undefined) updateData.sortOrder = parseInt(data.sortOrder);

    const updated = await prisma.loanMaster.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      ...updated,
      originalAmount: Number(updated.originalAmount),
      currentBalance: Number(updated.currentBalance),
      annualRate: Number(updated.annualRate),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.LOAN_CONFIRM);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const existing = await prisma.loanMaster.findUnique({
      where: { id },
      include: { monthlyRecords: { take: 1 } }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '貸款不存在', 404);
    }

    if (existing.monthlyRecords.length > 0) {
      return createErrorResponse('ACCOUNT_HAS_DEPENDENCIES', '此貸款已有月還款記錄，無法刪除', 400);
    }

    await prisma.loanMaster.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    const where = {};
    if (projectId) where.projectId = parseInt(projectId);

    const incomes = await prisma.engineeringIncome.findMany({
      where,
      include: {
        project: { select: { id: true, code: true, name: true, clientName: true, clientContractAmount: true, warehouse: true } },
        account: { select: { id: true, name: true, type: true, warehouse: true } },
      },
      orderBy: [{ projectId: 'asc' }, { receivedDate: 'desc' }],
      take: 500,
    });

    return NextResponse.json(incomes.map(i => ({
      ...i,
      amount: Number(i.amount),
      project: i.project ? { ...i.project, clientContractAmount: i.project.clientContractAmount != null ? Number(i.project.clientContractAmount) : null } : null,
    })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  try {
    const data = await request.json();

    if (!data.projectId || !data.termName?.trim() || !data.amount || !data.receivedDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '工程案、期數名稱、收款金額、收款日期為必填', 400);
    }

    const projectId = parseInt(data.projectId);
    const accountId = data.accountId ? parseInt(data.accountId) : null;
    const amount = parseFloat(data.amount);

    const project = await prisma.engineeringProject.findUnique({
      where: { id: projectId },
      select: { id: true, code: true, name: true, warehouse: true },
    });
    if (!project) return createErrorResponse('NOT_FOUND', '找不到工程案', 404);

    const income = await prisma.engineeringIncome.create({
      data: {
        projectId,
        termName: data.termName.trim(),
        amount,
        receivedDate: data.receivedDate,
        accountId,
        accountingSubject: data.accountingSubject?.trim() || null,
        note: data.note?.trim() || null,
      },
    });

    // Create cash transaction if account is specified
    if (accountId) {
      const txNo = await nextCashTransactionNo(prisma, data.receivedDate);
      const cashTx = await prisma.cashTransaction.create({
        data: {
          transactionNo: txNo,
          transactionDate: data.receivedDate,
          type: '收入',
          warehouse: project.warehouse || null,
          accountId,
          amount,
          fee: 0,
          hasFee: false,
          accountingSubject: data.accountingSubject?.trim() || '41000 工程收入',
          description: `工程收款 ${project.code} ${project.name} ${data.termName.trim()}`,
          sourceType: 'engineering_income',
          sourceRecordId: income.id,
          status: '已確認',
        },
      });

      await prisma.engineeringIncome.update({
        where: { id: income.id },
        data: { cashTransactionId: cashTx.id },
      });

      await recalcBalance(prisma, accountId);
    }

    const result = await prisma.engineeringIncome.findUnique({
      where: { id: income.id },
      include: {
        project: { select: { id: true, code: true, name: true, clientName: true, clientContractAmount: true, warehouse: true } },
        account: { select: { id: true, name: true, type: true, warehouse: true } },
      },
    });

    return NextResponse.json({
      ...result,
      amount: Number(result.amount),
      project: result.project ? { ...result.project, clientContractAmount: result.project.clientContractAmount != null ? Number(result.project.clientContractAmount) : null } : null,
    }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

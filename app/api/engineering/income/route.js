import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { nextCashTransactionNo } from '@/lib/sequence-generator';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';
import { assertPeriodOpen } from '@/lib/period-lock';

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
        progressClaim:  { select: { id: true, termName: true, claimNo: true, status: true } },
        outputInvoice:  { select: { id: true, invoiceNo: true, invoiceDate: true, dueDate: true, totalAmount: true } },
      },
      orderBy: [{ projectId: 'asc' }, { receivedDate: 'desc' }],
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
      select: { id: true, code: true, name: true, warehouse: true, clientContractAmount: true },
    });
    if (!project) return createErrorResponse('NOT_FOUND', '找不到工程案', 404);
    await assertEngineeringProjectOpen(projectId);

    // ENG3: 累計收款上限校驗
    if (data.progressClaimId) {
      const claim = await prisma.engineeringProgressClaim.findUnique({
        where: { id: parseInt(data.progressClaimId) },
        select: { termName: true, certifiedAmount: true },
      });
      if (claim?.certifiedAmount != null) {
        const claimTotal = await prisma.engineeringIncome.aggregate({
          where: { progressClaimId: parseInt(data.progressClaimId) },
          _sum: { amount: true },
        });
        const claimAfter = (Number(claimTotal._sum.amount) || 0) + amount;
        if (claimAfter > Number(claim.certifiedAmount)) {
          return createErrorResponse('VALIDATION_FAILED',
            `此期別（${claim.termName}）核定金額 ${Number(claim.certifiedAmount).toLocaleString()}，收款累計 ${claimAfter.toLocaleString()} 將超出`, 400);
        }
      }
    }
    if (project.clientContractAmount != null) {
      const projTotal = await prisma.engineeringIncome.aggregate({
        where: { projectId },
        _sum: { amount: true },
      });
      const projAfter = (Number(projTotal._sum.amount) || 0) + amount;
      if (projAfter > Number(project.clientContractAmount)) {
        return createErrorResponse('VALIDATION_FAILED',
          `收款累計（${projAfter.toLocaleString()}）將超過合約金額（${Number(project.clientContractAmount).toLocaleString()}）`, 400);
      }
    }

    let incomeId;
    await prisma.$transaction(async (tx) => {
      // ENG1: 月結期間鎖定檢查
      await assertPeriodOpen(tx, data.receivedDate, project.warehouse);

      const income = await tx.engineeringIncome.create({
        data: {
          projectId,
          progressClaimId:  data.progressClaimId  ? parseInt(data.progressClaimId)  : null,
          outputInvoiceId:  data.outputInvoiceId  ? parseInt(data.outputInvoiceId)  : null,
          termName: data.termName.trim(),
          amount,
          receivedDate: data.receivedDate,
          accountId,
          accountingSubject: data.accountingSubject?.trim() || null,
          note: data.note?.trim() || null,
        },
      });
      incomeId = income.id;

      if (accountId) {
        const txNo = await nextCashTransactionNo(tx, data.receivedDate);
        const cashTx = await tx.cashTransaction.create({
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
        await tx.engineeringIncome.update({
          where: { id: income.id },
          data: { cashTransactionId: cashTx.id },
        });
      }
    });

    if (accountId) await recalcBalance(prisma, accountId);

    const result = await prisma.engineeringIncome.findUnique({
      where: { id: incomeId },
      include: {
        project: { select: { id: true, code: true, name: true, clientName: true, clientContractAmount: true, warehouse: true } },
        account: { select: { id: true, name: true, type: true, warehouse: true } },
        progressClaim: { select: { id: true, termName: true, claimNo: true, status: true } },
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

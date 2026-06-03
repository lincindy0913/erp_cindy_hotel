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

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const incomeId = parseInt(id);
    const data = await request.json();

    const existing = await prisma.engineeringIncome.findUnique({
      where: { id: incomeId },
      include: { project: { select: { code: true, name: true, warehouse: true, clientContractAmount: true } } },
    });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到收款紀錄', 404);
    await assertEngineeringProjectOpen(existing.projectId);

    const amount       = parseFloat(data.amount);
    const receivedDate = data.receivedDate;
    const accountId    = data.accountId ? parseInt(data.accountId) : null;
    const termName     = data.termName?.trim() || existing.termName;

    // ENG3: 累計校驗（排除自身）
    const newProgressClaimId = data.progressClaimId !== undefined
      ? (data.progressClaimId ? parseInt(data.progressClaimId) : null)
      : existing.progressClaimId;

    if (newProgressClaimId) {
      const claim = await prisma.engineeringProgressClaim.findUnique({
        where: { id: newProgressClaimId },
        select: { termName: true, certifiedAmount: true },
      });
      if (claim?.certifiedAmount != null) {
        const claimTotal = await prisma.engineeringIncome.aggregate({
          where: { progressClaimId: newProgressClaimId, id: { not: incomeId } },
          _sum: { amount: true },
        });
        const claimAfter = (Number(claimTotal._sum.amount) || 0) + amount;
        if (claimAfter > Number(claim.certifiedAmount)) {
          return createErrorResponse('VALIDATION_FAILED',
            `此期別（${claim.termName}）核定金額 ${Number(claim.certifiedAmount).toLocaleString()}，收款累計 ${claimAfter.toLocaleString()} 將超出`, 400);
        }
      }
    }
    if (existing.project.clientContractAmount != null) {
      const projTotal = await prisma.engineeringIncome.aggregate({
        where: { projectId: existing.projectId, id: { not: incomeId } },
        _sum: { amount: true },
      });
      const projAfter = (Number(projTotal._sum.amount) || 0) + amount;
      if (projAfter > Number(existing.project.clientContractAmount)) {
        return createErrorResponse('VALIDATION_FAILED',
          `收款累計（${projAfter.toLocaleString()}）將超過合約金額（${Number(existing.project.clientContractAmount).toLocaleString()}）`, 400);
      }
    }

    await prisma.$transaction(async (tx) => {
      // ENG1: 月結期間鎖定
      await assertPeriodOpen(tx, receivedDate, existing.project.warehouse);

      await tx.engineeringIncome.update({
        where: { id: incomeId },
        data: {
          ...(data.progressClaimId !== undefined && { progressClaimId: newProgressClaimId }),
          ...(data.outputInvoiceId !== undefined && { outputInvoiceId: data.outputInvoiceId ? parseInt(data.outputInvoiceId) : null }),
          termName,
          amount,
          receivedDate,
          accountId,
          accountingSubject: data.accountingSubject?.trim() || null,
          note: data.note?.trim() || null,
        },
      });

      if (existing.cashTransactionId) {
        const description = `工程收款 ${existing.project.code} ${existing.project.name} ${termName}`;
        await tx.cashTransaction.update({
          where: { id: existing.cashTransactionId },
          data: {
            amount,
            transactionDate: receivedDate,
            accountId: accountId || existing.accountId,
            accountingSubject: data.accountingSubject?.trim() || '41000 工程收入',
            description,
            note: data.note?.trim() || null,
          },
        });
        if (accountId && accountId !== existing.accountId) {
          await recalcBalance(tx, existing.accountId);
        }
        if (accountId) await recalcBalance(tx, accountId);
      }
    });

    const result = await prisma.engineeringIncome.findUnique({
      where: { id: incomeId },
      include: {
        project: { select: { id: true, code: true, name: true, clientName: true, clientContractAmount: true, warehouse: true } },
        account: { select: { id: true, name: true, type: true, warehouse: true } },
      },
    });
    return NextResponse.json({ ...result, amount: Number(result.amount) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const incomeId = parseInt(id);

    const income = await prisma.engineeringIncome.findUnique({
      where: { id: incomeId },
      include: { project: { select: { warehouse: true, code: true, name: true } } },
    });
    if (!income) return createErrorResponse('NOT_FOUND', '找不到收款紀錄', 404);
    await assertEngineeringProjectOpen(income.projectId);

    // ENG2: 若有關聯現金流，預先讀取以備沖銷
    let originalCashTx = null;
    if (income.cashTransactionId) {
      originalCashTx = await prisma.cashTransaction.findUnique({
        where: { id: income.cashTransactionId },
        select: {
          id: true, transactionDate: true, type: true, warehouse: true,
          accountId: true, amount: true, accountingSubject: true,
          description: true, sourceType: true, sourceRecordId: true,
        },
      });
    }

    await prisma.$transaction(async (tx) => {
      // ENG1: 月結期間鎖定（以原始收款日為準）
      await assertPeriodOpen(tx, income.receivedDate, income.project?.warehouse);

      if (originalCashTx) {
        // ENG2: 建立沖銷交易，保留稽核軌跡（不硬刪除）
        const reversalNo = await nextCashTransactionNo(tx, originalCashTx.transactionDate);
        const reversal = await tx.cashTransaction.create({
          data: {
            transactionNo:    reversalNo,
            transactionDate:  originalCashTx.transactionDate,
            type:             originalCashTx.type === '收入' ? '支出' : '收入',
            warehouse:        originalCashTx.warehouse,
            accountId:        originalCashTx.accountId,
            amount:           originalCashTx.amount,
            fee: 0, hasFee: false,
            accountingSubject: originalCashTx.accountingSubject,
            description:      `[沖銷] ${originalCashTx.description}`,
            sourceType:       originalCashTx.sourceType,
            sourceRecordId:   originalCashTx.sourceRecordId,
            status:           '已確認',
            isReversal:       true,
            reversalOfId:     originalCashTx.id,
          },
        });
        // 標記原始交易已被沖銷
        await tx.cashTransaction.update({
          where: { id: originalCashTx.id },
          data:  { reversedById: reversal.id },
        });
      }

      await tx.engineeringIncome.delete({ where: { id: incomeId } });
    });

    if (income.accountId) await recalcBalance(prisma, income.accountId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}

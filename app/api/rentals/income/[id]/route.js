import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';


export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const incomeId = parseInt(id);
    const body = await request.json();

    const { actualAmount, actualDate, accountId, paymentMethod, matchTransferRef, matchBankAccountName } = body;

    if (!actualAmount || !actualDate || !accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '實收金額、收款日期、收款帳戶為必填', 400);
    }

    const income = await prisma.rentalIncome.findUnique({
      where: { id: incomeId },
      include: {
        contract: { select: { contractNo: true } },
        property: { select: { name: true } },
        tenant: { select: { fullName: true, companyName: true, tenantType: true } },
        payments: { orderBy: { sequenceNo: 'asc' } }
      }
    });

    if (!income) {
      return createErrorResponse('NOT_FOUND', '找不到收租紀錄', 404);
    }

    if (paymentMethod === 'transfer' && matchTransferRef) {
      const dupPayment = await prisma.rentalIncomePayment.findFirst({
        where: { matchTransferRef }
      });
      const dupIncome = await prisma.rentalIncome.findFirst({
        where: { matchTransferRef, id: { not: incomeId } }
      });
      if (dupPayment || dupIncome) {
        return createErrorResponse('CONFLICT_UNIQUE', '此轉帳參考號已被使用', 409);
      }
    }

    const parsedActual = parseFloat(actualAmount);
    const expected = Number(income.expectedAmount);
    const acctId = parseInt(accountId);
    const existingPayments = income.payments || [];
    const nextSeq = existingPayments.length + 1;
    const previousTotal = existingPayments.reduce((s, p) => s + Number(p.amount), 0);
    const newTotal = previousTotal + parsedActual;
    const newStatus = newTotal >= expected ? 'completed' : 'partial';

    const tenantName = income.tenant.tenantType === 'company'
      ? income.tenant.companyName
      : income.tenant.fullName;

    const transactionNo = await nextCashTransactionNo(tx, actualDate);
    const categoryId = await getCategoryId(prisma, 'rental_income');
    const category = categoryId
      ? await prisma.cashCategory.findUnique({
          where: { id: categoryId },
          include: { accountingSubject: { select: { code: true, name: true } } }
        })
      : null;
    const accountingSubjectLabel = category?.accountingSubject
      ? `${category.accountingSubject.code || ''} ${category.accountingSubject.name || ''}`.trim()
      : null;
    const tx = await prisma.cashTransaction.create({
      data: {
        transactionNo,
        transactionDate: actualDate,
        type: '收入',
        accountId: acctId,
        categoryId,
        accountingSubject: accountingSubjectLabel,
        amount: parsedActual,
        description: `租金收入 - ${income.property.name} - ${tenantName} - ${income.incomeYear}/${income.incomeMonth}${nextSeq > 1 ? ` (第${nextSeq}次)` : ''}`,
        sourceType: 'rental_income',
        sourceRecordId: incomeId,
        status: '已確認'
      }
    });

    await prisma.rentalIncomePayment.create({
      data: {
        rentalIncomeId: incomeId,
        sequenceNo: nextSeq,
        amount: parsedActual,
        paymentDate: actualDate,
        accountId: acctId,
        paymentMethod: paymentMethod || null,
        matchTransferRef: matchTransferRef || null,
        matchBankAccountName: matchBankAccountName || null,
        matchNote: body.matchNote || null,
        cashTransactionId: tx.id,
        confirmedBy: body.confirmedBy || null
      }
    });

    const firstTxId = existingPayments.length > 0 ? income.cashTransactionId : tx.id;
    await prisma.rentalIncome.update({
      where: { id: incomeId },
      data: {
        actualAmount: newTotal,
        actualDate: actualDate,
        accountId: acctId,
        paymentMethod: paymentMethod || null,
        matchTransferRef: matchTransferRef || null,
        matchBankAccountName: matchBankAccountName || null,
        matchNote: body.matchNote || null,
        status: newStatus,
        cashTransactionId: firstTxId ?? tx.id,
        confirmedAt: new Date(),
        confirmedBy: body.confirmedBy || null
      }
    });

    await recalcBalance(prisma, acctId);

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_INCOME_CONFIRM,
      targetModule: 'rentals',
      targetRecordId: incomeId,
      beforeState: { status: income.status, actualAmount: Number(income.actualAmount || 0) },
      afterState: { status: newStatus, actualAmount: newTotal, transactionId: tx.id, sequenceNo: nextSeq },
      note: `租金收款確認 ${income.property?.name} 第${nextSeq}次`,
    });

    return NextResponse.json({ success: true, status: newStatus, transactionId: tx.id, sequenceNo: nextSeq });
  } catch (error) {
    console.error('PUT /api/rentals/income/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

// PATCH: 編輯已登錄的收款（實收金額、收款日期、收款帳戶、付款方式），連動更新金流
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const incomeId = parseInt(id);
    const body = await request.json();

    const income = await prisma.rentalIncome.findUnique({
      where: { id: incomeId },
      include: {
        property: { select: { name: true } },
        tenant: { select: { fullName: true, companyName: true, tenantType: true } }
      }
    });
    if (!income) {
      return createErrorResponse('NOT_FOUND', '找不到收租紀錄', 404);
    }
    if (!income.cashTransactionId) {
      return createErrorResponse('VALIDATION_FAILED', '僅可編輯已收款的紀錄', 400);
    }

    const actualAmount = body.actualAmount != null && body.actualAmount !== '' ? parseFloat(body.actualAmount) : Number(income.actualAmount);
    const actualDate = body.actualDate || income.actualDate;
    const accountId = body.accountId != null && body.accountId !== '' ? parseInt(body.accountId) : income.accountId;
    const paymentMethod = body.paymentMethod != null ? body.paymentMethod : income.paymentMethod;

    if (!actualDate || !accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '收款日期、收款帳戶為必填', 400);
    }

    const cashTx = await prisma.cashTransaction.findUnique({
      where: { id: income.cashTransactionId }
    });
    if (!cashTx) {
      return createErrorResponse('NOT_FOUND', '找不到對應金流', 404);
    }

    const oldAccountId = cashTx.accountId;
    const newStatus = actualAmount >= Number(income.expectedAmount) ? 'completed' : 'partial';

    await prisma.$transaction(async (tx) => {
      await tx.cashTransaction.update({
        where: { id: income.cashTransactionId },
        data: {
          transactionDate: actualDate,
          accountId,
          amount: actualAmount,
          paymentTerms: paymentMethod || null
        }
      });
      await tx.rentalIncome.update({
        where: { id: incomeId },
        data: {
          actualAmount,
          actualDate,
          accountId,
          paymentMethod: paymentMethod || null,
          matchTransferRef: body.matchTransferRef != null ? body.matchTransferRef : income.matchTransferRef,
          matchBankAccountName: body.matchBankAccountName != null ? body.matchBankAccountName : income.matchBankAccountName,
          status: newStatus
        }
      });
    });

    await recalcBalance(prisma, accountId);
    if (oldAccountId !== accountId) await recalcBalance(prisma, oldAccountId);

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_INCOME_UPDATE,
      targetModule: 'rentals',
      targetRecordId: incomeId,
      beforeState: { actualAmount: Number(income.actualAmount), accountId: income.accountId, paymentMethod: income.paymentMethod },
      afterState: { actualAmount, accountId, paymentMethod },
      note: `租金收款編輯 ${income.property?.name}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/rentals/income/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

// DELETE: 作廢收款（沖銷所有付款金流、刪除付款紀錄、收租恢復待收）
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const incomeId = parseInt(id);

    const income = await prisma.rentalIncome.findUnique({
      where: { id: incomeId },
      include: {
        property: { select: { name: true } },
        tenant: { select: { fullName: true, companyName: true, tenantType: true } },
        payments: { orderBy: { sequenceNo: 'asc' } }
      }
    });
    if (!income) {
      return createErrorResponse('NOT_FOUND', '找不到收租紀錄', 404);
    }
    // 冪等：若已經是 pending 狀態，視為已作廢完成
    if (income.status === 'pending') {
      return createErrorResponse('VALIDATION_FAILED', '此紀錄已為待收款狀態，無需作廢', 409);
    }
    const payments = income.payments || [];
    if (payments.length === 0 && !income.cashTransactionId) {
      return createErrorResponse('VALIDATION_FAILED', '僅可作廢已收款的紀錄', 400);
    }

    const accountIds = new Set();
    const txsToReverse = payments.length > 0
      ? await prisma.cashTransaction.findMany({ where: { id: { in: payments.map(p => p.cashTransactionId).filter(Boolean) } } })
      : [];
    if (payments.length === 0 && income.cashTransactionId) {
      const single = await prisma.cashTransaction.findUnique({ where: { id: income.cashTransactionId } });
      if (single) txsToReverse.push(single);
    }
    txsToReverse.forEach(t => accountIds.add(t.accountId));

    await prisma.$transaction(async (tx) => {
      const revDate = new Date().toISOString().split('T')[0];
      for (const cashTx of txsToReverse) {
        // 冪等：re-read in transaction 確認尚未被沖銷
        const fresh = await tx.cashTransaction.findUnique({ where: { id: cashTx.id } });
        if (!fresh || fresh.reversedById) continue; // 已沖銷，跳過

        const revNo = await generateTransactionNo(revDate, tx);
        const reversalTx = await tx.cashTransaction.create({
          data: {
            transactionNo: revNo,
            transactionDate: revDate,
            type: '支出',
            accountId: fresh.accountId,
            categoryId: fresh.categoryId,
            amount: Number(fresh.amount),
            description: `沖銷：${fresh.description || ''}`,
            sourceType: 'reversal',
            sourceRecordId: fresh.id,
            status: '已確認',
            isReversal: true,
            reversalOfId: fresh.id
          }
        });
        await tx.cashTransaction.update({
          where: { id: fresh.id },
          data: { reversedById: reversalTx.id }
        });
      }
      await tx.rentalIncomePayment.deleteMany({ where: { rentalIncomeId: incomeId } });
      await tx.rentalIncome.update({
        where: { id: incomeId },
        data: {
          actualAmount: null,
          actualDate: null,
          accountId: null,
          paymentMethod: null,
          matchTransferRef: null,
          matchBankAccountName: null,
          matchNote: null,
          status: 'pending',
          cashTransactionId: null,
          confirmedAt: null,
          confirmedBy: null
        }
      });
    });

    for (const aid of accountIds) {
      await recalcBalance(prisma, aid);
    }

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_INCOME_DELETE,
      targetModule: 'rentals',
      targetRecordId: incomeId,
      beforeState: { status: income.status, actualAmount: Number(income.actualAmount || 0), paymentsCount: payments.length },
      afterState: { status: 'pending' },
      note: `租金收款作廢 ${income.property?.name}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/income/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

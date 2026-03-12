import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Generate transaction number: CF-YYYYMMDD-XXXX (optional tx for use inside transaction)
async function generateTransactionNo(date, txClient = null) {
  const db = txClient || prisma;
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;

  const existing = await db.cashTransaction.findMany({
    where: { transactionNo: { startsWith: prefix } },
    select: { transactionNo: true }
  });

  let maxSeq = 0;
  for (const t of existing) {
    const seq = parseInt(t.transactionNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// Recalculate account balance
async function recalcBalance(accountId) {
  const incomes = await prisma.cashTransaction.aggregate({
    where: { accountId, type: '收入' },
    _sum: { amount: true }
  });
  const expenses = await prisma.cashTransaction.aggregate({
    where: { accountId, type: '支出' },
    _sum: { amount: true }
  });
  const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
  const newBalance = Number(account.openingBalance) + Number(incomes._sum.amount || 0) - Number(expenses._sum.amount || 0);
  await prisma.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: newBalance }
  });
}

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
        tenant: { select: { fullName: true, companyName: true, tenantType: true } }
      }
    });

    if (!income) {
      return createErrorResponse('NOT_FOUND', '找不到收租紀錄', 404);
    }

    // If payment method is transfer, validate matchTransferRef uniqueness
    if (paymentMethod === 'transfer' && matchTransferRef) {
      const dupRef = await prisma.rentalIncome.findFirst({
        where: {
          matchTransferRef,
          id: { not: incomeId }
        }
      });
      if (dupRef) {
        return createErrorResponse('CONFLICT_UNIQUE', '此轉帳參考號已被使用', 409);
      }
    }

    const parsedActual = parseFloat(actualAmount);
    const expected = Number(income.expectedAmount);
    const acctId = parseInt(accountId);

    // Determine status
    let newStatus = 'completed';
    if (parsedActual < expected) {
      newStatus = 'partial';
    }

    // Create CashTransaction
    const tenantName = income.tenant.tenantType === 'company'
      ? income.tenant.companyName
      : income.tenant.fullName;

    const transactionNo = await generateTransactionNo(actualDate);
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
        description: `租金收入 - ${income.property.name} - ${tenantName} - ${income.incomeYear}/${income.incomeMonth}`,
        sourceType: 'rental_income',
        sourceRecordId: incomeId,
        status: '已確認'
      }
    });

    // Update rental income record
    await prisma.rentalIncome.update({
      where: { id: incomeId },
      data: {
        actualAmount: parsedActual,
        actualDate,
        accountId: acctId,
        paymentMethod: paymentMethod || null,
        matchTransferRef: matchTransferRef || null,
        matchBankAccountName: matchBankAccountName || null,
        matchNote: body.matchNote || null,
        status: newStatus,
        cashTransactionId: tx.id,
        confirmedAt: new Date(),
        confirmedBy: body.confirmedBy || null
      }
    });

    // If partial, create supplementary income record for the difference
    if (newStatus === 'partial') {
      const difference = expected - parsedActual;
      await prisma.rentalIncome.create({
        data: {
          contractId: income.contractId,
          propertyId: income.propertyId,
          tenantId: income.tenantId,
          incomeYear: income.incomeYear,
          incomeMonth: income.incomeMonth,
          dueDate: income.dueDate,
          expectedAmount: difference,
          status: 'pending',
          note: `補繳差額 - 原紀錄 #${incomeId}`
        }
      });
    }

    // Recalculate account balance
    await recalcBalance(acctId);

    return NextResponse.json({ success: true, status: newStatus, transactionId: tx.id });
  } catch (error) {
    console.error('PUT /api/rentals/income/[id] error:', error);
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

    await recalcBalance(accountId);
    if (oldAccountId !== accountId) await recalcBalance(oldAccountId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/rentals/income/[id] error:', error);
    return handleApiError(error);
  }
}

// DELETE: 作廢收款（沖銷金流、收租紀錄恢復待收）
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const incomeId = parseInt(id);

    const income = await prisma.rentalIncome.findUnique({
      where: { id: incomeId },
      include: { property: { select: { name: true } }, tenant: { select: { fullName: true, companyName: true, tenantType: true } } }
    });
    if (!income) {
      return createErrorResponse('NOT_FOUND', '找不到收租紀錄', 404);
    }
    if (!income.cashTransactionId) {
      return createErrorResponse('VALIDATION_FAILED', '僅可作廢已收款的紀錄', 400);
    }

    const cashTx = await prisma.cashTransaction.findUnique({
      where: { id: income.cashTransactionId }
    });
    if (!cashTx) {
      return createErrorResponse('NOT_FOUND', '找不到對應金流', 404);
    }

    const accountId = cashTx.accountId;
    const amount = Number(cashTx.amount);

    await prisma.$transaction(async (tx) => {
      const revDate = new Date().toISOString().split('T')[0];
      const revNo = await generateTransactionNo(revDate, tx);
      const reversalTx = await tx.cashTransaction.create({
        data: {
          transactionNo: revNo,
          transactionDate: revDate,
          type: '支出',
          accountId,
          categoryId: cashTx.categoryId,
          amount,
          description: `沖銷：${cashTx.description || ''}`,
          sourceType: 'reversal',
          sourceRecordId: cashTx.id,
          status: '已確認',
          isReversal: true,
          reversalOfId: cashTx.id
        }
      });
      await tx.cashTransaction.update({
        where: { id: cashTx.id },
        data: { reversedById: reversalTx.id }
      });
      await tx.rentalIncome.update({
        where: { id: incomeId },
        data: {
          actualAmount: null,
          actualDate: null,
          accountId: null,
          paymentMethod: null,
          matchTransferRef: null,
          matchBankAccountName: null,
          status: 'pending',
          cashTransactionId: null,
          confirmedAt: null,
          confirmedBy: null
        }
      });
      const supplementaries = await tx.rentalIncome.findMany({
        where: { note: { contains: `補繳差額 - 原紀錄 #${incomeId}` } }
      });
      for (const s of supplementaries) {
        await tx.rentalIncome.delete({ where: { id: s.id } });
      }
    });

    await recalcBalance(accountId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/income/[id] error:', error);
    return handleApiError(error);
  }
}

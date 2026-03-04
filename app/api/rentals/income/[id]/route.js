import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// Generate transaction number: CF-YYYYMMDD-XXXX
async function generateTransactionNo(date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;

  const existing = await prisma.cashTransaction.findMany({
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
    const tx = await prisma.cashTransaction.create({
      data: {
        transactionNo,
        transactionDate: actualDate,
        type: '收入',
        accountId: acctId,
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

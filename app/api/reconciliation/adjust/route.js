import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// POST: Create adjustment transaction
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();
    const { accountId, reconciliationId, amount, description, transactionDate } = data;

    if (!accountId || !reconciliationId || !amount || !description) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '帳戶、對帳記錄、金額及說明為必填', 400);
    }

    const account = await prisma.cashAccount.findUnique({ where: { id: parseInt(accountId) } });
    if (!account) {
      return createErrorResponse('NOT_FOUND', '帳戶不存在', 404);
    }

    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: parseInt(reconciliationId) }
    });
    if (!reconciliation) {
      return createErrorResponse('NOT_FOUND', '對帳記錄不存在', 404);
    }

    if (reconciliation.status === 'confirmed') {
      return createErrorResponse('VALIDATION_FAILED', '已確認的對帳記錄不可新增調整交易', 400);
    }

    const amountVal = parseFloat(amount);
    const isIncome = amountVal > 0;
    const absAmount = Math.abs(amountVal);

    // Generate transaction number
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const txCount = await prisma.cashTransaction.count({
      where: { transactionNo: { startsWith: `TX-${dateStr}` } }
    });
    const transactionNo = `TX-${dateStr}-${String(txCount + 1).padStart(4, '0')}`;

    const txDate = transactionDate || `${reconciliation.statementYear}-${String(reconciliation.statementMonth).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Create CashTransaction with sourceType='reconciliation_adjustment'
    const transaction = await prisma.cashTransaction.create({
      data: {
        transactionNo,
        transactionDate: txDate,
        type: isIncome ? '收入' : '支出',
        warehouse: account.warehouse,
        accountId: parseInt(accountId),
        amount: absAmount,
        description: `[對帳調整] ${description}`,
        sourceType: 'reconciliation_adjustment',
        sourceRecordId: parseInt(reconciliationId),
        status: '已確認'
      }
    });

    // Recalculate account balance
    const allTx = await prisma.cashTransaction.findMany({
      where: { accountId: parseInt(accountId) }
    });

    let balance = Number(account.openingBalance);
    allTx.forEach(tx => {
      const amt = Number(tx.amount);
      if (tx.type === '收入' || tx.type === '移轉入') balance += amt;
      else if (tx.type === '支出' || tx.type === '移轉') balance -= amt;
    });

    await prisma.cashAccount.update({
      where: { id: parseInt(accountId) },
      data: { currentBalance: balance }
    });

    // Update reconciliation: recalculate system closing balance and adjustment count
    const monthStart = `${reconciliation.statementYear}-${String(reconciliation.statementMonth).padStart(2, '0')}-01`;
    const nextMonth = reconciliation.statementMonth === 12 ? 1 : reconciliation.statementMonth + 1;
    const nextYear = reconciliation.statementMonth === 12 ? reconciliation.statementYear + 1 : reconciliation.statementYear;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // Recalculate opening balance
    const txBefore = await prisma.cashTransaction.findMany({
      where: { accountId: parseInt(accountId), transactionDate: { lt: monthStart } }
    });
    let openingBalance = Number(account.openingBalance);
    txBefore.forEach(tx => {
      const amt = Number(tx.amount);
      if (tx.type === '收入' || tx.type === '移轉入') openingBalance += amt;
      else if (tx.type === '支出' || tx.type === '移轉') openingBalance -= amt;
    });

    const txInMonth = await prisma.cashTransaction.findMany({
      where: { accountId: parseInt(accountId), transactionDate: { gte: monthStart, lt: monthEnd } }
    });
    let closingBalanceSystem = openingBalance;
    txInMonth.forEach(tx => {
      const amt = Number(tx.amount);
      if (tx.type === '收入' || tx.type === '移轉入') closingBalanceSystem += amt;
      else if (tx.type === '支出' || tx.type === '移轉') closingBalanceSystem -= amt;
    });

    const difference = closingBalanceSystem - Number(reconciliation.closingBalanceBank);

    await prisma.bankReconciliation.update({
      where: { id: parseInt(reconciliationId) },
      data: {
        openingBalance,
        closingBalanceSystem,
        difference,
        adjustmentCount: { increment: 1 }
      }
    });

    return NextResponse.json({
      transactionId: transaction.id,
      transactionNo: transaction.transactionNo,
      amount: Number(transaction.amount),
      type: transaction.type,
      closingBalanceSystem,
      difference,
      message: `調整交易已建立：${transaction.transactionNo}`
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

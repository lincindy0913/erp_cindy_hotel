import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const data = await request.json();

    const { paymentOrderId, executionDate, actualAmount, accountId, paymentMethod } = data;

    if (!paymentOrderId || !executionDate || actualAmount === undefined || !accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必要欄位', 400);
    }

    const order = await prisma.paymentOrder.findUnique({ where: { id: parseInt(paymentOrderId) } });
    if (!order) {
      return createErrorResponse('NOT_FOUND', '付款單不存在', 404);
    }
    if (order.status !== '待出納') {
      return createErrorResponse('VALIDATION_FAILED', '付款單狀態不正確，無法執行', 409);
    }

    // Auto-generate executionNo: CSH-YYYYMMDD-XXXX
    const dateStr = executionDate.replace(/-/g, '');
    const prefix = `CSH-${dateStr}-`;
    const existingExec = await prisma.cashierExecution.findMany({
      where: { executionNo: { startsWith: prefix } },
    });
    let maxSeq = 0;
    for (const item of existingExec) {
      const seq = parseInt(item.executionNo.substring(prefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
    const executionNo = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;

    // Auto-generate transaction number
    const txPrefix = `CF-${dateStr}-`;
    const existingTx = await prisma.cashTransaction.findMany({
      where: { transactionNo: { startsWith: txPrefix } },
    });
    let maxTxSeq = 0;
    for (const item of existingTx) {
      const seq = parseInt(item.transactionNo.substring(txPrefix.length)) || 0;
      if (seq > maxTxSeq) maxTxSeq = seq;
    }
    const txNo = `${txPrefix}${String(maxTxSeq + 1).padStart(4, '0')}`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create CashTransaction
      const categoryId = await getCategoryId(tx, 'cashier_payment');
      const cashTx = await tx.cashTransaction.create({
        data: {
          transactionNo: txNo,
          transactionDate: executionDate,
          type: '支出',
          warehouse: order.warehouse,
          accountId: parseInt(accountId),
          categoryId,
          amount: actualAmount,
          description: `出納付款 - ${order.orderNo} - ${order.supplierName || ''}`,
          sourceType: 'cashier_payment',
          sourceRecordId: order.id,
          paymentNo: order.orderNo,
          status: '已確認',
        },
      });

      // 2. Recalculate account balance
      const allTx = await tx.cashTransaction.findMany({
        where: { accountId: parseInt(accountId) },
      });
      const account = await tx.cashAccount.findUnique({ where: { id: parseInt(accountId) } });
      let balance = Number(account.openingBalance);
      for (const t of allTx) {
        const amt = Number(t.amount);
        const fee = Number(t.fee);
        if (t.type === '收入' || t.type === '移轉入') {
          balance += amt;
        } else {
          balance -= amt;
        }
        if (fee > 0) balance -= fee;
      }
      await tx.cashAccount.update({
        where: { id: parseInt(accountId) },
        data: { currentBalance: balance },
      });

      // 3. Create CashierExecution
      const execution = await tx.cashierExecution.create({
        data: {
          executionNo,
          paymentOrderId: parseInt(paymentOrderId),
          executionDate,
          actualAmount,
          accountId: parseInt(accountId),
          paymentMethod: paymentMethod || order.paymentMethod,
          checkNo: data.checkNo || null,
          cashTransactionId: cashTx.id,
          note: data.note || null,
          status: '已確認',
          executedBy: session?.user?.email || null,
        },
      });

      // 4. Update PaymentOrder status
      await tx.paymentOrder.update({
        where: { id: parseInt(paymentOrderId) },
        data: { status: '已執行' },
      });

      // 5. If this PaymentOrder is linked to a loan record, update it to 已預付
      const linkedLoanRecord = await tx.loanMonthlyRecord.findFirst({
        where: { paymentOrderId: parseInt(paymentOrderId) }
      });
      if (linkedLoanRecord && linkedLoanRecord.status === '待出納') {
        await tx.loanMonthlyRecord.update({
          where: { id: linkedLoanRecord.id },
          data: { status: '已預付' }
        });
      }

      return { execution, cashTx };
    });

    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CASHIER_EXECUTE,
        level: 'finance',
        targetModule: 'cashier',
        targetRecordId: result.execution.id,
        targetRecordNo: executionNo,
        afterState: {
          paymentOrderNo: order.orderNo,
          amount: actualAmount,
          accountId,
          cashTransactionNo: result.cashTx.transactionNo,
        },
      });
    }

    return NextResponse.json({
      executionNo,
      cashTransactionNo: result.cashTx.transactionNo,
      message: '出納確認執行成功',
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

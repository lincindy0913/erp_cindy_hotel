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

    const { paymentOrderId, executionDate, actualAmount, accountId, paymentMethod, isEmployeeAdvance, advancedBy, advancePaymentMethod } = data;

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

      // 5. If this PaymentOrder is linked to a loan record, update it to 已預付 with actual amounts
      const linkedLoanRecord = await tx.loanMonthlyRecord.findFirst({
        where: { paymentOrderId: parseInt(paymentOrderId) }
      });
      if (linkedLoanRecord && linkedLoanRecord.status === '待出納') {
        await tx.loanMonthlyRecord.update({
          where: { id: linkedLoanRecord.id },
          data: {
            status: '已預付',
            actualTotal: actualAmount,
            actualDebitDate: executionDate,
            deductAccountId: parseInt(accountId)
          }
        });
      }

      // 6. If this PaymentOrder is linked to rental maintenance, update maintenance to paid and link cash tx
      const linkedMaintenance = await tx.rentalMaintenance.findFirst({
        where: { paymentOrderId: parseInt(paymentOrderId) }
      });
      if (linkedMaintenance) {
        await tx.rentalMaintenance.update({
          where: { id: linkedMaintenance.id },
          data: { status: 'paid', cashTransactionId: cashTx.id }
        });

        // 7. If maintenance was an employee advance, create EmployeeAdvance record
        if (linkedMaintenance.isEmployeeAdvance && linkedMaintenance.advancedBy) {
          const advDateStr = executionDate.replace(/-/g, '');
          const advPrefix = `ADV-${advDateStr}-`;
          const existingAdv = await tx.employeeAdvance.findMany({
            where: { advanceNo: { startsWith: advPrefix } },
            select: { advanceNo: true },
          });
          let maxAdvSeq = 0;
          for (const item of existingAdv) {
            const seq = parseInt(item.advanceNo.substring(advPrefix.length)) || 0;
            if (seq > maxAdvSeq) maxAdvSeq = seq;
          }
          const advanceNo = `${advPrefix}${String(maxAdvSeq + 1).padStart(4, '0')}`;

          const advance = await tx.employeeAdvance.create({
            data: {
              advanceNo,
              employeeName: linkedMaintenance.advancedBy,
              paymentMethod: linkedMaintenance.advancePaymentMethod || '現金',
              sourceType: 'maintenance',
              sourceRecordId: linkedMaintenance.id,
              sourceDescription: `維護費 - ${order.summary || ''}`,
              paymentOrderId: parseInt(paymentOrderId),
              paymentOrderNo: order.orderNo,
              amount: actualAmount,
              status: '待結算',
              warehouse: order.warehouse,
              createdBy: session?.user?.email || null,
            },
          });

          // Link back to maintenance
          await tx.rentalMaintenance.update({
            where: { id: linkedMaintenance.id },
            data: { employeeAdvanceId: advance.id },
          });
        }
      }

      // 6b. If this PaymentOrder is linked to property tax, update tax to paid and link cash tx
      const linkedTax = await tx.propertyTax.findFirst({
        where: { paymentOrderId: parseInt(paymentOrderId) }
      });
      if (linkedTax) {
        await tx.propertyTax.update({
          where: { id: linkedTax.id },
          data: {
            status: 'paid',
            cashTransactionId: cashTx.id,
            confirmedAt: new Date(),
            confirmedBy: session?.user?.email || null
          }
        });
      }

      // 8. If cashier marked this as employee advance (from cashier form), create EmployeeAdvance
      if (isEmployeeAdvance && advancedBy) {
        const advDateStr2 = executionDate.replace(/-/g, '');
        const advPrefix2 = `ADV-${advDateStr2}-`;
        const existingAdv2 = await tx.employeeAdvance.findMany({
          where: { advanceNo: { startsWith: advPrefix2 } },
          select: { advanceNo: true },
        });
        let maxAdvSeq2 = 0;
        for (const item of existingAdv2) {
          const seq = parseInt(item.advanceNo.substring(advPrefix2.length)) || 0;
          if (seq > maxAdvSeq2) maxAdvSeq2 = seq;
        }
        const advNo = `${advPrefix2}${String(maxAdvSeq2 + 1).padStart(4, '0')}`;

        await tx.employeeAdvance.create({
          data: {
            advanceNo: advNo,
            employeeName: advancedBy,
            paymentMethod: advancePaymentMethod || '現金',
            sourceType: 'cashier',
            sourceRecordId: order.id,
            sourceDescription: order.summary || `付款單 ${order.orderNo}`,
            paymentOrderId: parseInt(paymentOrderId),
            paymentOrderNo: order.orderNo,
            amount: actualAmount,
            status: '待結算',
            warehouse: order.warehouse,
            createdBy: session?.user?.email || null,
          },
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

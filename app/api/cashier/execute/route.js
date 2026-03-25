import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { recalcBalance } from '@/lib/recalc-balance';
import { assertPeriodOpen } from '@/lib/period-lock';
import { nextSequence } from '@/lib/sequence-generator';
import { checkIdempotency, saveIdempotency, getIdempotencyKey } from '@/lib/idempotency';
import { requireMoney, requireInt } from '@/lib/safe-parse';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  // Idempotency-Key support: replay cached response if available
  const cachedRes = checkIdempotency(request);
  if (cachedRes) return cachedRes;

  try {
    const auth = await requirePermission(PERMISSIONS.CASHIER_EXECUTE);
    if (!auth.ok) return auth.response;
    const session = auth.session;
    const data = await request.json();

    const { paymentOrderId, executionDate, actualAmount, accountId, paymentMethod, isEmployeeAdvance, advancedBy, advancePaymentMethod } = data;

    if (!paymentOrderId || !executionDate || actualAmount === undefined || !accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必要欄位', 400);
    }

    const parsedAmount = requireMoney(actualAmount, '金額', { min: 0.01 });
    const parsedAccountId = requireInt(accountId, '帳戶ID');
    const parsedOrderId = requireInt(paymentOrderId, '付款單ID');

    const dateStr = executionDate.replace(/-/g, '');

    const result = await prisma.$transaction(async (tx) => {
      // 0. Re-fetch and verify status INSIDE transaction to prevent double-execution
      const order = await tx.paymentOrder.findUnique({ where: { id: parsedOrderId } });
      if (!order) throw new Error('NOT_FOUND:付款單不存在');
      if (order.status !== '待出納') throw new Error('IDEMPOTENT:付款單已執行或狀態不正確');

      // Enforce period lock
      await assertPeriodOpen(tx, executionDate, order.warehouse);

      // Auto-generate executionNo & txNo with row-level locking to prevent race conditions
      const executionNo = await nextSequence(tx, 'cashierExecution', 'executionNo', `CSH-${dateStr}-`);
      const txNo = await nextSequence(tx, 'cashTransaction', 'transactionNo', `CF-${dateStr}-`);

      // 1. 建立現金流扣款（包含支票支付：出納執行時即建立，支票分頁兌現時不再重複建立）
      const categoryId = await getCategoryId(tx, 'cashier_payment');
      const cashTx = await tx.cashTransaction.create({
        data: {
          transactionNo: txNo,
          transactionDate: executionDate,
          type: '支出',
          warehouse: order.warehouse,
          accountId: parsedAccountId,
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
      await recalcBalance(tx, parsedAccountId);

      // 3. Create CashierExecution
      const execution = await tx.cashierExecution.create({
        data: {
          executionNo,
          paymentOrderId: parsedOrderId,
          executionDate,
          actualAmount,
          accountId: parsedAccountId,
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
        where: { id: parsedOrderId },
        data: { status: '已執行' },
      });

      // 4b. 支票支付：若有關聯 Check，將支票標記為兌現（現金流已在步驟1建立，不重複）
      const linkedCheck = await tx.check.findFirst({
        where: { paymentId: parsedOrderId },
      });
      if (linkedCheck) {
        await tx.check.update({
          where: { id: linkedCheck.id },
          data: {
            status: 'cleared',
            clearDate: executionDate,
            actualAmount: actualAmount,
            cashTransactionId: cashTx.id,
            clearedBy: session?.user?.email || null,
          },
        });
      }

      // 5. If this PaymentOrder is linked to a loan record, update it to 已預付 with actual amounts
      const linkedLoanRecord = await tx.loanMonthlyRecord.findFirst({
        where: { paymentOrderId: parsedOrderId }
      });
      if (linkedLoanRecord && linkedLoanRecord.status === '待出納') {
        await tx.loanMonthlyRecord.update({
          where: { id: linkedLoanRecord.id },
          data: {
            status: '已預付',
            actualTotal: actualAmount,
            actualDebitDate: executionDate,
            deductAccountId: parsedAccountId
          }
        });
      }

      // 6. If this PaymentOrder is linked to rental maintenance, update maintenance to paid and link cash tx
      const linkedMaintenance = await tx.rentalMaintenance.findFirst({
        where: { paymentOrderId: parsedOrderId }
      });
      if (linkedMaintenance) {
        await tx.rentalMaintenance.update({
          where: { id: linkedMaintenance.id },
          data: { status: 'paid', cashTransactionId: cashTx.id }
        });

        // 7. If maintenance was an employee advance, create EmployeeAdvance record
        if (linkedMaintenance.isEmployeeAdvance && linkedMaintenance.advancedBy) {
          const advanceNo = await nextSequence(tx, 'employeeAdvance', 'advanceNo', `ADV-${dateStr}-`);

          const advance = await tx.employeeAdvance.create({
            data: {
              advanceNo,
              employeeName: linkedMaintenance.advancedBy,
              paymentMethod: linkedMaintenance.advancePaymentMethod || '現金',
              sourceType: 'maintenance',
              sourceRecordId: linkedMaintenance.id,
              sourceDescription: `維護費 - ${order.summary || ''}`,
              paymentOrderId: parsedOrderId,
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

      // 6b. If this PaymentOrder is linked to engineering contract term, check partial vs full payment
      if (order.sourceType === 'engineering' && order.sourceRecordId) {
        const linkedTerm = await tx.engineeringContractTerm.findUnique({
          where: { id: order.sourceRecordId },
          include: { contract: { include: { terms: true } } },
        });
        if (linkedTerm && linkedTerm.status !== 'paid') {
          // Sum all executed payment orders for this term (including this one)
          const allPOs = await tx.paymentOrder.findMany({
            where: { sourceType: 'engineering', sourceRecordId: linkedTerm.id, status: '已執行' },
            select: { amount: true },
          });
          // Use cents-based arithmetic to avoid floating-point accumulation errors
          const totalPaidCents = allPOs.reduce((s, po) => s + Math.round(Number(po.amount) * 100), 0) + Math.round(Number(order.amount) * 100);
          const termAmountCents = Math.round(Number(linkedTerm.amount) * 100);
          const totalPaid = totalPaidCents / 100;
          const termAmount = termAmountCents / 100;

          if (totalPaid >= termAmount) {
            // Fully paid
            await tx.engineeringContractTerm.update({
              where: { id: linkedTerm.id },
              data: {
                status: 'paid',
                paidAt: executionDate,
                paymentOrderId: parsedOrderId,
              },
            });
            // Auto-update contract status if all terms are now paid
            if (linkedTerm.contract && Array.isArray(linkedTerm.contract.terms)) {
              const allTerms = linkedTerm.contract.terms;
              const allPaidAfter = allTerms.every(t => t.id === linkedTerm.id ? true : t.status === 'paid');
              if (allPaidAfter) {
                await tx.engineeringContract.update({
                  where: { id: linkedTerm.contractId },
                  data: { status: 'completed' },
                });
              }
            }
          }
          // else: partial payment — term stays 'pending', no status change
        }
      }

      // 6c. If this PaymentOrder is for deposit refund, update contract and link cash tx
      if (order.sourceType === 'rental_deposit_out' && order.sourceRecordId) {
        await tx.rentalContract.update({
          where: { id: order.sourceRecordId },
          data: {
            depositRefunded: true,
            depositRefundCashTransactionId: cashTx.id,
          }
        });
      }

      // 6d. If this PaymentOrder is linked to property tax, update tax to paid and link cash tx
      const linkedTax = await tx.propertyTax.findFirst({
        where: { paymentOrderId: parsedOrderId }
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
        const advNo = await nextSequence(tx, 'employeeAdvance', 'advanceNo', `ADV-${dateStr}-`);

        await tx.employeeAdvance.create({
          data: {
            advanceNo: advNo,
            employeeName: advancedBy,
            paymentMethod: advancePaymentMethod || '現金',
            sourceType: 'cashier',
            sourceRecordId: order.id,
            sourceDescription: order.summary || `付款單 ${order.orderNo}`,
            paymentOrderId: parsedOrderId,
            paymentOrderNo: order.orderNo,
            amount: actualAmount,
            status: '待結算',
            warehouse: order.warehouse,
            createdBy: session?.user?.email || null,
          },
        });
      }

      return { execution, cashTx, order, executionNo, txNo };
    });

    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CASHIER_EXECUTE,
        level: 'finance',
        targetModule: 'cashier',
        targetRecordId: result.execution.id,
        targetRecordNo: result.executionNo,
        afterState: {
          paymentOrderNo: result.order.orderNo,
          amount: actualAmount,
          accountId,
          cashTransactionNo: result.cashTx.transactionNo,
        },
      });
    }

    const resBody = {
      executionNo: result.executionNo,
      cashTransactionNo: result.cashTx.transactionNo,
      message: '出納確認執行成功',
    };
    saveIdempotency(request, resBody, 201);
    return NextResponse.json(resBody, { status: 201 });
  } catch (error) {
    // handleApiError now handles all prefix patterns (IDEMPOTENT:, NOT_FOUND:, PERIOD_LOCKED:, etc.) + Prisma errors
    return handleApiError(error, '/api/cashier/execute');
  }
}

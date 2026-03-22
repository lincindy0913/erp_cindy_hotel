import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getCategoryId } from '@/lib/cash-category-helper';
import { recalcBalance } from '@/lib/recalc-balance';
import { assertPeriodOpen } from '@/lib/period-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Helper: generate next CF transaction number
async function generateTxNo(tx, dateStr) {
  const txPrefix = `CF-${dateStr.replace(/-/g, '')}-`;
  const existingTx = await tx.cashTransaction.findMany({
    where: { transactionNo: { startsWith: txPrefix } },
    select: { transactionNo: true },
  });
  let maxSeq = 0;
  for (const item of existingTx) {
    const seq = parseInt(item.transactionNo.substring(txPrefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }
  return `${txPrefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// POST: 確認折讓/全額退貨 → 建立退款交易 + 回沖相關資料
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    const id = parseInt(params.id);
    const body = await request.json();
    const { accountId, refundDate } = body;

    if (!accountId) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇退款帳戶', 400);

    const result = await prisma.$transaction(async (tx) => {
      const allowance = await tx.purchaseAllowance.findUnique({
        where: { id },
        include: { details: true },
      });
      if (!allowance) throw new Error('NOT_FOUND:找不到折讓單');
      if (allowance.status !== '草稿') throw new Error(`IDEMPOTENT:無法確認：目前狀態為「${allowance.status}」`);

      const totalAmount = Number(allowance.totalAmount);
      if (totalAmount <= 0) throw new Error('折讓金額必須大於 0');

      const isFullReturn = allowance.allowanceType === '全額退貨';

      // Validate account exists
      const account = await tx.cashAccount.findUnique({ where: { id: parseInt(accountId) } });
      if (!account) throw new Error('找不到退款帳戶');

      // Generate CashTransaction number
      const txDate = refundDate || allowance.allowanceDate;

      // Enforce period lock
      await assertPeriodOpen(tx, txDate, allowance.warehouse);
      const txNo = await generateTxNo(tx, txDate);

      // Get category
      const categoryId = await getCategoryId(tx, 'purchase_allowance');

      const descPrefix = isFullReturn ? '全額退貨退款' : '進貨折讓退款';

      // Create CashTransaction (收入 = refund from supplier)
      const cashTx = await tx.cashTransaction.create({
        data: {
          transactionNo: txNo,
          transactionDate: txDate,
          type: '收入',
          warehouse: allowance.warehouse,
          accountId: parseInt(accountId),
          categoryId,
          supplierId: allowance.supplierId,
          amount: totalAmount,
          description: `${descPrefix} — ${allowance.allowanceNo} ${allowance.supplierName || ''} ${allowance.reason || ''}`.trim(),
          sourceType: 'purchase_allowance',
          sourceRecordId: allowance.id,
          paymentNo: allowance.allowanceNo,
          status: '已確認',
          isAutoCreated: false,
          createdBy: session?.user?.id ? parseInt(session.user.id) : null,
        },
      });

      // Recalculate account balance
      await recalcBalance(tx, parseInt(accountId));

      // --- 回沖損益表相關數據 ---
      const allowanceDateStr = allowance.allowanceDate || txDate;
      let rollbackYear, rollbackMonth;
      if (allowanceDateStr) {
        const parts = allowanceDateStr.split('-');
        rollbackYear = parseInt(parts[0]);
        rollbackMonth = parseInt(parts[1]);
      }

      let originalWarehouse = allowance.warehouse;
      if (allowance.paymentOrderId) {
        const po = await tx.paymentOrder.findUnique({ where: { id: allowance.paymentOrderId } });
        if (po) {
          originalWarehouse = originalWarehouse || po.warehouse;
          if (po.sourceRecordId && (po.sourceType === 'common_expense' || po.sourceType === 'fixed_expense')) {
            const cer = await tx.commonExpenseRecord.findUnique({ where: { id: po.sourceRecordId } });
            if (cer?.expenseMonth) {
              const eParts = cer.expenseMonth.split('-');
              rollbackYear = parseInt(eParts[0]);
              rollbackMonth = parseInt(eParts[1]);
            }
          }
        }
      }

      // Roll back DepartmentExpense
      if (rollbackYear && rollbackMonth && originalWarehouse) {
        const deptExpenses = await tx.departmentExpense.findMany({
          where: { year: rollbackYear, month: rollbackMonth, department: originalWarehouse },
        });
        const matchDE = deptExpenses.find(de => de.category.includes('進貨') || de.category.includes('採購'))
          || deptExpenses[0];
        if (matchDE) {
          const newTotal = Math.max(0, Number(matchDE.totalAmount) - totalAmount);
          const newTax = Math.max(0, Number(matchDE.tax) - Number(allowance.tax || 0));
          await tx.departmentExpense.update({
            where: { id: matchDE.id },
            data: { totalAmount: newTotal, tax: newTax },
          });
        }
      }

      // Roll back MonthlyAggregation
      if (rollbackYear && rollbackMonth) {
        const agg = await tx.monthlyAggregation.findFirst({
          where: {
            aggregationType: 'purchase',
            year: rollbackYear,
            month: rollbackMonth,
            warehouse: originalWarehouse || null,
          },
        });
        if (agg) {
          const newTotal = Math.max(0, Number(agg.totalAmount) - totalAmount);
          await tx.monthlyAggregation.update({
            where: { id: agg.id },
            data: {
              totalAmount: newTotal,
              recordCount: Math.max(0, agg.recordCount - 1),
            },
          });
        }
      }

      // ====== 全額退貨 額外處理 ======
      const extraActions = [];

      if (isFullReturn) {
        // 1. 標記原付款單為「已退貨」
        if (allowance.paymentOrderId) {
          await tx.paymentOrder.update({
            where: { id: allowance.paymentOrderId },
            data: { status: '已退貨' },
          });
          extraActions.push(`付款單 ${allowance.paymentOrderNo} 已標記退貨`);
        }

        // 2. 標記原發票為「已退貨」
        if (allowance.invoiceId) {
          await tx.salesMaster.update({
            where: { id: allowance.invoiceId },
            data: { status: '已退貨' },
          });
          extraActions.push(`發票 ${allowance.invoiceNo} 已標記退貨`);
        }

        // 3. 標記原進貨單為「已退貨」
        if (allowance.purchaseId) {
          await tx.purchaseMaster.update({
            where: { id: allowance.purchaseId },
            data: { status: '已退貨' },
          });
          extraActions.push(`進貨單 ${allowance.purchaseNo} 已標記退貨`);
        } else if (allowance.purchaseNo) {
          // Try to find by purchaseNo
          const pm = await tx.purchaseMaster.findUnique({
            where: { purchaseNo: allowance.purchaseNo },
          });
          if (pm) {
            await tx.purchaseMaster.update({
              where: { id: pm.id },
              data: { status: '已退貨' },
            });
            extraActions.push(`進貨單 ${allowance.purchaseNo} 已標記退貨`);
          }
        }

        // 4. 沖銷原出納交易 — 建立反向交易 (reversal)
        if (allowance.paymentOrderId) {
          const originalCashTx = await tx.cashTransaction.findFirst({
            where: {
              sourceType: 'cashier_payment',
              sourceRecordId: allowance.paymentOrderId,
              status: '已確認',
            },
          });
          if (originalCashTx) {
            const reversalNo = await generateTxNo(tx, txDate);
            const reversalTx = await tx.cashTransaction.create({
              data: {
                transactionNo: reversalNo,
                transactionDate: txDate,
                type: '收入',
                warehouse: originalCashTx.warehouse,
                accountId: originalCashTx.accountId,
                categoryId: originalCashTx.categoryId,
                supplierId: originalCashTx.supplierId,
                amount: Number(originalCashTx.amount),
                description: `沖銷退貨 — 原交易 ${originalCashTx.transactionNo} ${allowance.supplierName || ''}`,
                sourceType: 'reversal',
                sourceRecordId: originalCashTx.id,
                paymentNo: allowance.allowanceNo,
                status: '已確認',
                isReversal: true,
                reversalOfId: originalCashTx.id,
                isAutoCreated: true,
                autoCreationReason: `全額退貨 ${allowance.allowanceNo}`,
                createdBy: session?.user?.id ? parseInt(session.user.id) : null,
              },
            });

            // Mark original as reversed
            await tx.cashTransaction.update({
              where: { id: originalCashTx.id },
              data: {
                status: '已沖銷',
                reversedById: reversalTx.id,
              },
            });

            // Recalculate the original account balance too
            if (originalCashTx.accountId !== parseInt(accountId)) {
              await recalcBalance(tx, originalCashTx.accountId);
            }

            extraActions.push(`原出納交易 ${originalCashTx.transactionNo} 已沖銷`);
          }
        }
      }

      // Update allowance status
      await tx.purchaseAllowance.update({
        where: { id },
        data: {
          status: '已確認',
          refundAccountId: parseInt(accountId),
          cashTransactionId: cashTx.id,
          cashTransactionNo: txNo,
          confirmedBy: session?.user?.email || body.confirmedBy || null,
          confirmedAt: new Date(),
        },
      });

      return {
        allowanceNo: allowance.allowanceNo,
        allowanceType: allowance.allowanceType,
        txNo,
        totalAmount,
        extraActions,
      };
    });

    // Audit log
    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CASH_TRANSACTION_CREATE,
        targetModule: 'purchase_allowance',
        targetRecordNo: result.allowanceNo,
        afterState: { allowanceType: result.allowanceType, totalAmount: result.totalAmount, txNo: result.txNo },
        note: `折讓/退貨確認 ${result.allowanceNo}`,
      });
    }

    const typeLabel = result.allowanceType === '全額退貨' ? '全額退貨' : '折讓';
    let message = `${typeLabel}單 ${result.allowanceNo} 已確認，退款 NT$ ${result.totalAmount.toLocaleString()} 已入帳 (${result.txNo})`;
    if (result.extraActions?.length > 0) {
      message += '\n' + result.extraActions.join('\n');
    }

    return NextResponse.json({ message, ...result });
  } catch (error) {
    if (error.message?.startsWith('IDEMPOTENT:')) {
      return createErrorResponse('VALIDATION_FAILED', error.message.replace('IDEMPOTENT:', ''), 409);
    }
    if (error.message?.startsWith('NOT_FOUND:')) {
      return createErrorResponse('NOT_FOUND', error.message.replace('NOT_FOUND:', ''), 404);
    }
    if (error.message?.startsWith('PERIOD_LOCKED:')) {
      return createErrorResponse('PERIOD_LOCKED', error.message.replace('PERIOD_LOCKED:', ''), 423);
    }
    console.error('POST /api/purchase-allowances/[id]/confirm error:', error);
    return handleApiError(error);
  }
}

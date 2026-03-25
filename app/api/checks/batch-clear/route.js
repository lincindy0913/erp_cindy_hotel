import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { recalcBalance } from '@/lib/recalc-balance';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertPeriodOpen } from '@/lib/period-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';


export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.CHECK_CLEAR);
  if (!auth.ok) return auth.response;
  
  try {
    const { checkIds, clearDate, clearedBy } = await request.json();

    if (!checkIds || !Array.isArray(checkIds) || checkIds.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供支票ID列表', 400);
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    const effectiveClearDate = clearDate || new Date().toISOString().split('T')[0];

    // Wrap entire batch in a single transaction — all succeed or all fail
    const clearedCount = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const checkId of checkIds) {
        const check = await tx.check.findUnique({ where: { id: parseInt(checkId) } });

        if (!check) throw new Error(`VALIDATION:找不到支票 ID ${checkId}`);

        // Enforce period lock
        await assertPeriodOpen(tx, effectiveClearDate, check.warehouse);
        if (check.status === 'cleared') throw new Error(`VALIDATION:支票 ${check.checkNo} 已兌現`);
        if (check.status !== 'pending' && check.status !== 'due') {
          throw new Error(`VALIDATION:支票 ${check.checkNo} 狀態「${check.status}」無法兌現`);
        }

        // 規則：有 paymentId 的支票 = 來自付款單，現金流已在出納執行時建立，此處不重複建立 CashTransaction
        const fromPaymentOrder = !!check.paymentId;
        let cashTransactionId = null;

        if (!fromPaymentOrder) {
          let accountId, txType, sourceType;
          if (check.checkType === 'payable') {
            accountId = check.sourceAccountId;
            txType = '支出';
            sourceType = 'check_payment';
          } else {
            accountId = check.destinationAccountId;
            txType = '收入';
            sourceType = 'check_receipt';
          }

          if (!accountId) throw new Error(`VALIDATION:支票 ${check.checkNo} 未關聯帳戶`);

          const transactionNo = await nextCashTransactionNo(tx, effectiveClearDate);
          const categoryId = await getCategoryId(tx, sourceType);
          const transaction = await tx.cashTransaction.create({
            data: {
              transactionNo,
              transactionDate: effectiveClearDate,
              type: txType,
              warehouse: check.warehouse,
              accountId,
              categoryId,
              amount: Number(check.amount),
              description: `批次兌現 - ${check.checkNo} (${check.checkNumber})`,
              sourceType,
              sourceRecordId: check.id,
              status: '已確認'
            }
          });
          cashTransactionId = transaction.id;

          await recalcBalance(tx, accountId);
        }

        await tx.check.update({
          where: { id: parseInt(checkId) },
          data: {
            status: 'cleared',
            clearDate: effectiveClearDate,
            actualAmount: Number(check.amount),
            clearedBy: clearedBy || null,
            ...(cashTransactionId ? { cashTransactionId } : {})
          }
        });
        count++;
      }
      return count;
    }, { timeout: 60000 });

    // Audit log
    const session = await getServerSession(authOptions);
    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CHECK_CLEAR,
        targetModule: 'check',
        afterState: { success: clearedCount, clearDate: effectiveClearDate },
        note: `批次兌現 ${clearedCount} 筆支票`,
      });
    }

    return NextResponse.json({
      message: `批次兌現完成：成功 ${clearedCount} 筆`,
      success: clearedCount, failed: 0, errors: []
    });
  } catch (error) {
    return handleApiError(error);
  }
}

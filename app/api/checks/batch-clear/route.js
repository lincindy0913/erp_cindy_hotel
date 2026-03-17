import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { recalcBalance } from '@/lib/recalc-balance';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

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
    const affectedAccountIds = new Set();

    for (const checkId of checkIds) {
      try {
        const check = await prisma.check.findUnique({ where: { id: parseInt(checkId) } });

        if (!check) {
          results.failed++;
          results.errors.push({ checkId, error: '找不到支票' });
          continue;
        }

        if (check.status === 'cleared') {
          results.failed++;
          results.errors.push({ checkId, error: '支票已兌現' });
          continue;
        }

        if (check.status !== 'pending' && check.status !== 'due') {
          results.failed++;
          results.errors.push({ checkId, error: `支票狀態 ${check.status} 無法兌現` });
          continue;
        }

        // 規則：有 paymentId 的支票 = 來自付款單，現金流已在出納執行時建立，此處不重複建立 CashTransaction（避免重複扣款）
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

          if (!accountId) {
            results.failed++;
            results.errors.push({ checkId, error: '支票未關聯帳戶' });
            continue;
          }

          const transactionNo = await generateTransactionNo(effectiveClearDate);
          const categoryId = await getCategoryId(prisma, sourceType);
          const transaction = await prisma.cashTransaction.create({
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
          affectedAccountIds.add(accountId);
        }

        await prisma.check.update({
          where: { id: parseInt(checkId) },
          data: {
            status: 'cleared',
            clearDate: effectiveClearDate,
            actualAmount: Number(check.amount),
            clearedBy: clearedBy || null,
            ...(cashTransactionId ? { cashTransactionId } : {})
          }
        });
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ checkId, error: err.message });
      }
    }

    // Recalculate all affected account balances
    for (const accountId of affectedAccountIds) {
      await recalcBalance(prisma, accountId);
    }

    return NextResponse.json({
      message: `批次兌現完成：成功 ${results.success} 筆，失敗 ${results.failed} 筆`,
      ...results
    });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { nextCashTransactionNo } from '@/lib/sequence-generator';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

// POST: 解除月結 — 倒退狀態並自動沖銷月結現金流交易
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { warehouse, yearMonth } = await request.json();
    if (!warehouse || !yearMonth) {
      return createErrorResponse('VALIDATION_FAILED', '請提供館別與月份', 400);
    }

    const settlement = await prisma.pmsMonthlySettlement.findUnique({
      where: { warehouse_settlementMonth: { warehouse, settlementMonth: yearMonth } },
    });

    if (!settlement) {
      return createErrorResponse('NOT_FOUND', '找不到月度結算記錄', 404);
    }
    if (settlement.status !== '已結算') {
      return createErrorResponse('VALIDATION_FAILED', `此月份狀態為「${settlement.status}」，無需解鎖`, 400);
    }

    const [y, m] = yearMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const startDate = `${yearMonth}-01`;
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    // Step 1: 倒退 PMS 狀態（批次 + 月結）
    await prisma.$transaction([
      prisma.pmsImportBatch.updateMany({
        where: { warehouse, businessDate: { gte: startDate, lte: endDate }, status: '已結算' },
        data: { status: '已核對' },
      }),
      prisma.pmsMonthlySettlement.update({
        where: { warehouse_settlementMonth: { warehouse, settlementMonth: yearMonth } },
        data: { status: '已核對', settledBy: null, settledAt: null },
      }),
    ]);

    // Step 2: 找出本月的月結現金流交易（未被沖銷的）
    const settleTxs = await prisma.cashTransaction.findMany({
      where: {
        warehouse,
        sourceType: { in: ['pms_income_settlement', 'pms_income_fee'] },
        autoCreationReason: { contains: yearMonth },
        isReversal: false,
        reversedById: null,
      },
      select: {
        id: true, type: true, amount: true, accountId: true,
        warehouse: true, categoryId: true, sourceType: true,
      },
    });

    let reversedCount = 0;

    if (settleTxs.length > 0) {
      const today = todayStr();

      await prisma.$transaction(async (tx) => {
        const affectedAccountIds = new Set();

        for (const orig of settleTxs) {
          const txNo = await nextCashTransactionNo(tx, today);
          const reversalTx = await tx.cashTransaction.create({
            data: {
              transactionNo: txNo,
              transactionDate: today,
              // 收入 → 支出，支出 → 收入（對沖）
              type: orig.type === '收入' ? '支出' : '收入',
              warehouse: orig.warehouse,
              accountId: orig.accountId,
              categoryId: orig.categoryId,
              amount: orig.amount,
              fee: 0,
              hasFee: false,
              description: `[沖銷] PMS月度結算 ${yearMonth} 解鎖 — ${orig.warehouse}`,
              sourceType: orig.sourceType,
              isAutoCreated: true,
              autoCreationReason: `PMS月度結算解鎖 ${yearMonth}`,
              isReversal: true,
              reversalOfId: orig.id,
              status: '已確認',
            },
          });

          await tx.cashTransaction.update({
            where: { id: orig.id },
            data: { reversedById: reversalTx.id },
          });

          affectedAccountIds.add(orig.accountId);
        }

        for (const acctId of affectedAccountIds) {
          await recalcBalance(tx, acctId);
        }

        reversedCount = settleTxs.length;
      });
    }

    // 稽核日誌
    const session = await getServerSession(authOptions);
    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.MONTH_END_UNLOCK,
        targetModule: 'pms_income',
        afterState: { warehouse, yearMonth, reversedCount },
        note: `PMS月結解鎖 ${warehouse} ${yearMonth}（自動沖銷 ${reversedCount} 筆現金流交易）`,
      });
    }

    return NextResponse.json({
      success: true,
      reversedCount,
      message: reversedCount > 0
        ? `${warehouse} ${yearMonth} 已解除月結，並自動沖銷 ${reversedCount} 筆現金流交易。`
        : `${warehouse} ${yearMonth} 已解除月結（無需沖銷現金流交易）。`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

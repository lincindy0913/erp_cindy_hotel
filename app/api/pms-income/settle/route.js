import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { assertPeriodOpen } from '@/lib/period-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';

// POST: 結算已核對的月度 PMS 收入 → 建立現金流交易（每批次一組，非整月匯總）
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.CASHFLOW_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const { warehouse, yearMonth } = data;

    if (!warehouse || !yearMonth) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請指定館別和月份', 400);
    }

    // 付款方式設定（依館別，無則用預設 warehouse=''）
    const paymentConfigs = await prisma.pmsPaymentMethodConfig.findMany({
      where: { isActive: true, OR: [{ warehouse }, { warehouse: '' }] }
    });
    const configMap = {};
    for (const c of paymentConfigs) {
      if (c.warehouse === warehouse) configMap[c.pmsColumnName] = c;
    }
    for (const c of paymentConfigs) {
      if (c.warehouse === '' && !configMap[c.pmsColumnName]) configMap[c.pmsColumnName] = c;
    }

    // 月份日期範圍
    const startDate = `${yearMonth}-01`;
    const [y, m] = yearMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    // 取得所有已核對批次（含借方記錄）
    const batches = await prisma.pmsImportBatch.findMany({
      where: { warehouse, businessDate: { gte: startDate, lte: endDate }, status: '已核對' },
      include: {
        records: {
          where: { entryType: '借方' },
          select: { pmsColumnName: true, amount: true },
        }
      },
      orderBy: { businessDate: 'asc' },
    });

    if (batches.length === 0) {
      return createErrorResponse('NOT_FOUND', '此月份無已核對的批次', 404);
    }

    // 早期重複偵測（在 transaction 外）
    const [existingSettleTxCount, existingPushCount] = await Promise.all([
      prisma.cashTransaction.count({
        where: {
          warehouse,
          sourceType: { in: ['pms_income_settlement', 'pms_income_fee'] },
          autoCreationReason: { contains: yearMonth },
          isReversal: false,
          reversedById: null,
        },
      }),
      prisma.pmsIncomeRecord.count({
        where: {
          warehouse,
          businessDate: { gte: startDate, lte: endDate },
          cashTransactionId: { not: null },
        },
      }),
    ]);

    if (existingSettleTxCount > 0) {
      return createErrorResponse(
        'DUPLICATE_SETTLEMENT',
        `此月份已有 ${existingSettleTxCount} 筆月結現金流交易。如需重新結算，請先執行「解除月結」。`,
        409
      );
    }

    if (existingPushCount > 0) {
      return createErrorResponse(
        'PUSH_CONFLICT',
        `此月份有 ${existingPushCount} 筆收入記錄已透過「推送現金流」建立交易。請先至現金流頁面沖銷這些交易後，再執行月度結算，以避免重複計帳。`,
        409
      );
    }

    // 建立現金流交易（每批次一組）
    const result = await prisma.$transaction(async (tx) => {
      // Transaction 內再次確認月結狀態
      const settlement = await tx.pmsMonthlySettlement.findUnique({
        where: { warehouse_settlementMonth: { warehouse, settlementMonth: yearMonth } }
      });
      if (!settlement || settlement.status !== '已核對') {
        if (settlement?.status === '已結算') {
          throw new Error('IDEMPOTENT:此月份已結算完成');
        }
        throw new Error('VALIDATION:此月份尚未核對完成，請先由會計核對後再結算');
      }

      // 檢查會計期間鎖定（以月底日期為代表）
      await assertPeriodOpen(tx, endDate, warehouse);

      const created = [];
      const skipped = [];
      const affectedAccountIds = new Set();
      const userName = auth.user?.name || auth.user?.email || 'system';

      // ── 核心：每批次（每業務日）建立一組現金流 ──
      for (const batch of batches) {
        // 彙總本批次的借方金額，依付款科目分組
        const batchByColumn = {};
        for (const rec of batch.records) {
          const key = rec.pmsColumnName;
          batchByColumn[key] = (batchByColumn[key] || 0) + Number(rec.amount);
        }

        for (const [columnName, batchAmount] of Object.entries(batchByColumn)) {
          if (batchAmount <= 0) continue;

          const config = configMap[columnName];
          if (!config || !config.cashAccountId) {
            skipped.push({ columnName, batchDate: batch.businessDate, total: batchAmount, reason: '未設定收入帳戶' });
            continue;
          }

          const accountId = config.cashAccountId;
          const feeRate = Number(config.feePercentage) / 100;
          // 手續費依本批次金額計算（非整月匯總），保留整數
          const fee = feeRate > 0 ? Math.round(batchAmount * feeRate) : 0;
          const delayDays = config.settlementDelayDays || 0;

          // 每批次使用批次日期；信用卡類加延遲天數
          let txDate;
          if (delayDays > 0) {
            const d = new Date(batch.businessDate);
            d.setDate(d.getDate() + delayDays);
            txDate = d.toISOString().split('T')[0];
          } else {
            txDate = batch.businessDate;
          }

          // 建立收入交易
          const txNo = await nextCashTransactionNo(tx, txDate);
          const pmsCatId = await getCategoryId(tx, 'pms_income_settlement');
          await tx.cashTransaction.create({
            data: {
              transactionNo: txNo,
              transactionDate: txDate,
              type: '收入',
              warehouse,
              accountId,
              categoryId: pmsCatId,
              amount: batchAmount,
              fee,
              hasFee: fee > 0,
              description: `PMS ${batch.businessDate} ${columnName} — ${warehouse}`,
              sourceType: 'pms_income_settlement',
              sourceRecordId: batch.id,
              isAutoCreated: true,
              autoCreationReason: `PMS月度結算 ${yearMonth}`,
              status: '已確認',
            },
          });

          affectedAccountIds.add(accountId);
          created.push({ columnName, batchDate: batch.businessDate, total: batchAmount, fee, transactionDate: txDate });

          // 手續費（信用卡）：獨立一筆支出交易
          if (fee > 0) {
            const feeTxNo = await nextCashTransactionNo(tx, txDate);
            const feeCatId = await getCategoryId(tx, 'pms_income_fee');
            await tx.cashTransaction.create({
              data: {
                transactionNo: feeTxNo,
                transactionDate: txDate,
                type: '支出',
                warehouse,
                accountId,
                categoryId: feeCatId,
                amount: fee,
                fee: 0,
                hasFee: false,
                description: `PMS ${batch.businessDate} ${columnName} 手續費 ${config.feePercentage}% — ${warehouse}`,
                sourceType: 'pms_income_fee',
                sourceRecordId: batch.id,
                isAutoCreated: true,
                autoCreationReason: `PMS月度結算 ${yearMonth}`,
                status: '已確認',
              },
            });
          }
        }
      }

      // 重算受影響帳戶餘額
      for (const acctId of affectedAccountIds) {
        await recalcBalance(tx, acctId);
      }

      // 更新批次狀態為已結算
      await tx.pmsImportBatch.updateMany({
        where: { warehouse, businessDate: { gte: startDate, lte: endDate }, status: '已核對' },
        data: { status: '已結算' },
      });

      // 更新月結記錄
      await tx.pmsMonthlySettlement.update({
        where: { warehouse_settlementMonth: { warehouse, settlementMonth: yearMonth } },
        data: { status: '已結算', settledBy: userName, settledAt: new Date() },
      });

      return { created, skipped };
    });

    // 稽核日誌
    const session = await getServerSession(authOptions);
    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CASH_TRANSACTION_CREATE,
        targetModule: 'pms_income',
        afterState: { warehouse, yearMonth, createdCount: result.created.length, batchCount: batches.length },
        note: `PMS月度結算 ${warehouse} ${yearMonth}（共 ${batches.length} 批次，${result.created.length} 筆交易）`,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${warehouse} ${yearMonth} 結算完成（${batches.length} 批次 / ${result.created.length} 筆現金流交易）`,
      incomeTransactions: result.created,
      skipped: result.skipped,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET: 取得月度結算狀態
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.CASHFLOW_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const yearMonth = searchParams.get('yearMonth');

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (yearMonth) where.settlementMonth = yearMonth;

    const settlements = await prisma.pmsMonthlySettlement.findMany({
      where,
      orderBy: [{ settlementMonth: 'desc' }, { warehouse: 'asc' }],
    });

    return NextResponse.json(settlements.map(s => ({
      ...s,
      creditTotal: Number(s.creditTotal),
      debitTotal: Number(s.debitTotal),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      verifiedAt: s.verifiedAt ? s.verifiedAt.toISOString() : null,
      settledAt: s.settledAt ? s.settledAt.toISOString() : null,
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

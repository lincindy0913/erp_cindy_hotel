import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';

export const dynamic = 'force-dynamic';

async function generateTransactionNo(tx, date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;
  const existing = await tx.cashTransaction.findMany({
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

// POST: 結算已核對的月度 PMS 收入 → 建立現金流交易
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.CASHFLOW_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const { warehouse, yearMonth } = data;

    if (!warehouse || !yearMonth) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請指定館別和月份', 400);
    }

    // Check monthly settlement exists and is verified
    const settlement = await prisma.pmsMonthlySettlement.findUnique({
      where: { warehouse_settlementMonth: { warehouse, settlementMonth: yearMonth } }
    });

    if (!settlement || settlement.status !== '已核對') {
      return createErrorResponse('VALIDATION_FAILED', '此月份尚未核對完成，請先由會計核對後再結算', 400);
    }

    if (settlement.status === '已結算') {
      return createErrorResponse('VALIDATION_FAILED', '此月份已結算完成', 400);
    }

    // Get payment method configs（依館別，無則用預設 warehouse=''）
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

    // Get all verified batches for this month
    const startDate = `${yearMonth}-01`;
    const [y, m] = yearMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    const batches = await prisma.pmsImportBatch.findMany({
      where: {
        warehouse,
        businessDate: { gte: startDate, lte: endDate },
        status: '已核對'
      },
      include: {
        records: {
          where: { entryType: '借方' }  // Only debit-side (payment methods: 現金, 信用卡, 轉帳)
        }
      }
    });

    if (batches.length === 0) {
      return createErrorResponse('NOT_FOUND', '此月份無已核對的批次', 404);
    }

    // Aggregate income by pmsColumnName across all batches
    const incomeByType = {};
    for (const batch of batches) {
      for (const record of batch.records) {
        const key = record.pmsColumnName;
        if (!incomeByType[key]) {
          incomeByType[key] = { total: 0, records: [], dates: new Set() };
        }
        incomeByType[key].total += Number(record.amount);
        incomeByType[key].records.push(record);
        incomeByType[key].dates.add(record.businessDate);
      }
    }

    // Create cashflow transactions
    const result = await prisma.$transaction(async (tx) => {
      const created = [];
      const skipped = [];
      const affectedAccountIds = new Set();
      const userName = auth.user?.name || auth.user?.email || 'system';

      for (const [columnName, data] of Object.entries(incomeByType)) {
        const config = configMap[columnName];
        if (!config || !config.cashAccountId) {
          skipped.push({ columnName, total: data.total, reason: '未設定收入帳戶' });
          continue;
        }

        if (data.total <= 0) {
          skipped.push({ columnName, total: data.total, reason: '金額為零或負數' });
          continue;
        }

        const accountId = config.cashAccountId;
        const feeRate = Number(config.feePercentage) / 100;
        const fee = feeRate > 0 ? Math.round(data.total * feeRate) : 0;
        const delayDays = config.settlementDelayDays || 0;

        // Calculate transaction date
        // For delayed settlement (credit cards), use last day of month + delay
        let txDate;
        if (delayDays > 0) {
          const settlementDate = new Date(y, m - 1, lastDay);
          settlementDate.setDate(settlementDate.getDate() + delayDays);
          txDate = settlementDate.toISOString().split('T')[0];
        } else {
          // Use last day of the business month
          txDate = endDate;
        }

        // Create income transaction
        const txNo = await generateTransactionNo(tx, txDate);
        const pmsCatId = await getCategoryId(tx, 'pms_income_settlement');
        const cashTx = await tx.cashTransaction.create({
          data: {
            transactionNo: txNo,
            transactionDate: txDate,
            type: '收入',
            warehouse,
            accountId,
            categoryId: pmsCatId,
            amount: data.total,
            fee: fee,
            hasFee: fee > 0,
            description: `PMS ${yearMonth} ${columnName} — ${warehouse} (${data.records.length}筆)`,
            sourceType: 'pms_income_settlement',
            isAutoCreated: true,
            autoCreationReason: `PMS月度結算 ${yearMonth}`,
            status: '已確認'
          }
        });

        affectedAccountIds.add(accountId);

        created.push({
          columnName,
          total: data.total,
          fee,
          transactionNo: txNo,
          transactionDate: txDate,
          delayDays,
          accountId
        });

        // If there's a fee (credit card), create a separate expense transaction for the fee
        if (fee > 0) {
          const feeTxNo = await generateTransactionNo(tx, txDate);
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
              description: `PMS ${yearMonth} ${columnName} 手續費 ${config.feePercentage}% — ${warehouse}`,
              sourceType: 'pms_income_fee',
              isAutoCreated: true,
              autoCreationReason: `PMS月度結算手續費 ${yearMonth}`,
              status: '已確認'
            }
          });
        }
      }

      // Recalculate all affected account balances
      for (const acctId of affectedAccountIds) {
        await recalcBalance(tx, acctId);
      }

      // Update batch statuses to 已結算
      await tx.pmsImportBatch.updateMany({
        where: {
          warehouse,
          businessDate: { gte: startDate, lte: endDate },
          status: '已核對'
        },
        data: { status: '已結算' }
      });

      // Update monthly settlement
      await tx.pmsMonthlySettlement.update({
        where: { warehouse_settlementMonth: { warehouse, settlementMonth: yearMonth } },
        data: {
          status: '已結算',
          settledBy: userName,
          settledAt: new Date()
        }
      });

      return { created, skipped };
    });

    return NextResponse.json({
      success: true,
      message: `${warehouse} ${yearMonth} 結算完成`,
      incomeTransactions: result.created,
      skipped: result.skipped
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
      orderBy: [{ settlementMonth: 'desc' }, { warehouse: 'asc' }]
    });

    const result = settlements.map(s => ({
      ...s,
      creditTotal: Number(s.creditTotal),
      debitTotal: Number(s.debitTotal),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      verifiedAt: s.verifiedAt ? s.verifiedAt.toISOString() : null,
      settledAt: s.settledAt ? s.settledAt.toISOString() : null
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Generate count number: CC-YYYYMMDD-XXXX
async function generateCountNo(countDate) {
  const dateStr = (countDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CC-${dateStr}-`;

  const existing = await prisma.cashCount.findMany({
    where: { countNo: { startsWith: prefix } },
    select: { countNo: true }
  });

  let maxSeq = 0;
  for (const c of existing) {
    const seq = parseInt(c.countNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// Helper: recalculate account balance from opening + all transactions
async function recalcBalance(tx, accountId) {
  const account = await tx.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const transactions = await tx.cashTransaction.findMany({
    where: { accountId },
    select: { type: true, amount: true, fee: true, hasFee: true }
  });

  let balance = Number(account.openingBalance);
  for (const t of transactions) {
    const amt = Number(t.amount);
    const fee = t.hasFee ? Number(t.fee) : 0;

    if (t.type === '收入') {
      balance += amt;
    } else if (t.type === '支出') {
      balance -= amt;
      balance -= fee;
    } else if (t.type === '移轉') {
      balance -= amt;
      balance -= fee;
    } else if (t.type === '移轉入') {
      balance += amt;
    }
  }

  await tx.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: balance }
  });
}

// GET /api/cash-count - List cash counts with filters
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CASH_COUNT_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const countYear = searchParams.get('countYear');
    const countMonth = searchParams.get('countMonth');
    const isAbnormal = searchParams.get('isAbnormal');

    const where = {};

    if (accountId) where.accountId = parseInt(accountId);
    if (status) where.status = status;
    if (isAbnormal === 'true') where.isAbnormal = true;
    if (isAbnormal === 'false') where.isAbnormal = false;

    if (countYear) where.countYear = parseInt(countYear);
    if (countMonth) where.countMonth = parseInt(countMonth);

    // Date range filter on countDate (stored as string YYYY-MM-DD)
    if (startDate && endDate) {
      where.countDate = { gte: startDate, lte: endDate };
    } else if (startDate) {
      where.countDate = { gte: startDate };
    } else if (endDate) {
      where.countDate = { lte: endDate };
    }

    const cashCounts = await prisma.cashCount.findMany({
      where,
      include: {
        account: {
          select: { id: true, name: true, type: true, warehouse: true, currentBalance: true }
        },
        details: {
          orderBy: { denomination: 'desc' }
        }
      },
      orderBy: [{ countDate: 'desc' }, { id: 'desc' }]
    });

    const result = cashCounts.map(c => ({
      ...c,
      systemBalance: Number(c.systemBalance),
      actualBalance: Number(c.actualBalance),
      difference: Number(c.difference),
      account: c.account ? {
        ...c.account,
        currentBalance: Number(c.account.currentBalance)
      } : null,
      details: c.details.map(d => ({
        ...d,
        denomination: Number(d.denomination),
        subtotal: Number(d.subtotal)
      })),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      countedAt: c.countedAt ? c.countedAt.toISOString() : null,
      reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/cash-count - Create new cash count with denomination details
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.CASH_COUNT_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    // Validate required fields
    if (!data.accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '帳戶為必填', 400);
    }
    if (!data.countDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '盤點日期為必填', 400);
    }
    if (!data.countedByUserId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '清點人員為必填', 400);
    }
    if (!data.details || !Array.isArray(data.details) || data.details.length === 0) {
      return createErrorResponse('CASH_COUNT_INVALID_INPUT', '面額明細不可為空', 400);
    }

    const accountId = parseInt(data.accountId);

    // Validate account exists and is cash type
    const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return createErrorResponse('NOT_FOUND', '帳戶不存在', 404);
    }
    if (account.type !== '現金') {
      return createErrorResponse('CASH_COUNT_INVALID_ACCOUNT', '只有現金帳戶可進行盤點', 400);
    }

    // Validate denomination details
    for (const detail of data.details) {
      if (detail.denomination === undefined || detail.denomination === null) {
        return createErrorResponse('CASH_COUNT_INVALID_INPUT', '面額不可為空', 400);
      }
      if (detail.quantity === undefined || detail.quantity === null || detail.quantity < 0) {
        return createErrorResponse('CASH_COUNT_INVALID_INPUT', '清點數量不可為負數', 400);
      }
      const denom = parseFloat(detail.denomination);
      if (isNaN(denom) || denom <= 0) {
        return createErrorResponse('CASH_COUNT_INVALID_INPUT', '面額必須為正數', 400);
      }
    }

    // Calculate actual balance from details
    let actualBalance = 0;
    const processedDetails = data.details.map(d => {
      const denomination = parseFloat(d.denomination);
      const quantity = parseInt(d.quantity) || 0;
      const subtotal = denomination * quantity;
      actualBalance += subtotal;
      return {
        denomination,
        quantity,
        subtotal,
        note: d.note || null
      };
    });

    // System balance = account's current balance at count time
    const systemBalance = Number(account.currentBalance);

    // Calculate difference: systemBalance - actualBalance (positive = shortage, negative = surplus)
    // Per spec: 差異 = 系統金額 - 實際清點金額
    const difference = systemBalance - actualBalance;

    // Determine difference type
    let differenceType = 'balanced';
    if (Math.abs(difference) <= 1) {
      differenceType = 'balanced';
    } else if (difference < 0) {
      differenceType = 'surplus'; // actual > system = surplus
    } else {
      differenceType = 'shortage'; // system > actual = shortage
    }

    // Check shortage threshold from config
    const config = await prisma.cashCountConfig.findUnique({
      where: { accountId }
    });
    const shortageThreshold = config ? Number(config.shortageThreshold) : 5000;

    // Determine if abnormal (shortage exceeds threshold)
    const isAbnormal = differenceType === 'shortage' && Math.abs(difference) > shortageThreshold;

    // Determine initial status based on difference
    let status;
    if (differenceType === 'balanced') {
      // No difference (within +/- 1), auto confirm
      status = 'confirmed';
    } else if (differenceType === 'surplus') {
      // Surplus: auto confirm and create adjustment transaction
      status = 'confirmed';
    } else if (differenceType === 'shortage' && !isAbnormal) {
      // Small shortage: auto confirm and create shortage transaction
      status = 'confirmed';
    } else {
      // Large shortage (abnormal): pending review
      status = 'pending';
    }

    // Parse date parts for year/month indexing
    const dateParts = data.countDate.split('-');
    const countYear = parseInt(dateParts[0]);
    const countMonth = parseInt(dateParts[1]);

    // Generate count number
    const countNo = await generateCountNo(data.countDate);

    // Execute creation within a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the CashCount record
      const cashCount = await tx.cashCount.create({
        data: {
          countNo,
          accountId,
          countDate: data.countDate,
          countYear,
          countMonth,
          status,
          isAbnormal,
          difference,
          differenceType,
          systemBalance,
          actualBalance,
          countedByUserId: parseInt(data.countedByUserId),
          countedAt: new Date(),
          note: data.note || null,
          details: {
            create: processedDetails
          }
        },
        include: {
          details: true,
          account: {
            select: { id: true, name: true, type: true, warehouse: true }
          }
        }
      });

      // If confirmed with a difference, create a CashTransaction for adjustment
      let cashTransactionId = null;

      if (status === 'confirmed' && differenceType !== 'balanced') {
        // Generate transaction number
        const txDateStr = (data.countDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
        const txPrefix = `CF-${txDateStr}-`;
        const existingTxs = await tx.cashTransaction.findMany({
          where: { transactionNo: { startsWith: txPrefix } },
          select: { transactionNo: true }
        });
        let maxSeq = 0;
        for (const t of existingTxs) {
          const seq = parseInt(t.transactionNo.substring(txPrefix.length)) || 0;
          if (seq > maxSeq) maxSeq = seq;
        }
        const txNo = `${txPrefix}${String(maxSeq + 1).padStart(4, '0')}`;

        const absDifference = Math.abs(difference);

        if (differenceType === 'surplus') {
          // Surplus: actual > system, so add income to account
          const surplusCatId = await getCategoryId(tx, 'cash_count_adjustment');
          const newTx = await tx.cashTransaction.create({
            data: {
              transactionNo: txNo,
              transactionDate: data.countDate,
              type: '收入',
              warehouse: account.warehouse || null,
              accountId,
              categoryId: surplusCatId,
              amount: absDifference,
              fee: 0,
              hasFee: false,
              description: `現金盤點盈餘調整 (${countNo})`,
              sourceType: 'cash_count_adjustment',
              status: '已確認'
            }
          });
          cashTransactionId = newTx.id;
        } else if (differenceType === 'shortage') {
          // Small shortage: system > actual, so create expense from account
          const shortageCatId = await getCategoryId(tx, 'cash_count_shortage');
          const newTx = await tx.cashTransaction.create({
            data: {
              transactionNo: txNo,
              transactionDate: data.countDate,
              type: '支出',
              warehouse: account.warehouse || null,
              accountId,
              categoryId: shortageCatId,
              amount: absDifference,
              fee: 0,
              hasFee: false,
              description: `現金盤點短缺 (${countNo})`,
              sourceType: 'cash_count_shortage',
              status: '已確認'
            }
          });
          cashTransactionId = newTx.id;
        }

        // Update the cash count with the linked transaction
        if (cashTransactionId) {
          await tx.cashCount.update({
            where: { id: cashCount.id },
            data: { cashTransactionId }
          });
        }

        // Recalculate account balance
        await recalcBalance(tx, accountId);
      }

      // Return the final record
      const finalRecord = await tx.cashCount.findUnique({
        where: { id: cashCount.id },
        include: {
          details: { orderBy: { denomination: 'desc' } },
          account: {
            select: { id: true, name: true, type: true, warehouse: true, currentBalance: true }
          }
        }
      });

      return finalRecord;
    });

    return NextResponse.json({
      ...result,
      systemBalance: Number(result.systemBalance),
      actualBalance: Number(result.actualBalance),
      difference: Number(result.difference),
      account: result.account ? {
        ...result.account,
        currentBalance: Number(result.account.currentBalance)
      } : null,
      details: result.details.map(d => ({
        ...d,
        denomination: Number(d.denomination),
        subtotal: Number(d.subtotal)
      })),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      countedAt: result.countedAt ? result.countedAt.toISOString() : null,
      reviewedAt: result.reviewedAt ? result.reviewedAt.toISOString() : null
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

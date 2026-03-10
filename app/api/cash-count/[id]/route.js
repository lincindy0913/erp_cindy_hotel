import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

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

// Helper: generate cash transaction number
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

// Helper: serialize a CashCount record for JSON response
function serializeCashCount(c) {
  return {
    ...c,
    systemBalance: Number(c.systemBalance),
    actualBalance: Number(c.actualBalance),
    difference: Number(c.difference),
    account: c.account ? {
      ...c.account,
      currentBalance: Number(c.account.currentBalance)
    } : null,
    details: c.details ? c.details.map(d => ({
      ...d,
      denomination: Number(d.denomination),
      subtotal: Number(d.subtotal)
    })) : [],
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    countedAt: c.countedAt ? c.countedAt.toISOString() : null,
    reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null
  };
}

// GET /api/cash-count/[id] - Get single cash count detail
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASH_COUNT_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const cashCount = await prisma.cashCount.findUnique({
      where: { id },
      include: {
        account: {
          select: { id: true, name: true, type: true, warehouse: true, currentBalance: true }
        },
        details: {
          orderBy: { denomination: 'desc' }
        }
      }
    });

    if (!cashCount) {
      return createErrorResponse('NOT_FOUND', '盤點記錄不存在', 404);
    }

    // If there is a linked transaction, fetch it
    let linkedTransaction = null;
    if (cashCount.cashTransactionId) {
      linkedTransaction = await prisma.cashTransaction.findUnique({
        where: { id: cashCount.cashTransactionId },
        select: {
          id: true,
          transactionNo: true,
          transactionDate: true,
          type: true,
          amount: true,
          description: true,
          sourceType: true,
          status: true
        }
      });
      if (linkedTransaction) {
        linkedTransaction.amount = Number(linkedTransaction.amount);
      }
    }

    return NextResponse.json({
      ...serializeCashCount(cashCount),
      linkedTransaction
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT /api/cash-count/[id] - Update / submit / review cash count
// Actions via `data.action`:
//   - "update"   : Update a draft/pending cash count (details, note)
//   - "confirm"  : Confirm a pending count (transition to confirmed)
//   - "approve"  : Approve a pending abnormal shortage (admin)
//   - "reject"   : Reject a pending abnormal shortage (admin, sets status to void)
//   - "unlock"   : Unlock a confirmed/approved count for re-editing (admin)
export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASH_COUNT_REVIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.cashCount.findUnique({
      where: { id },
      include: {
        details: true,
        account: {
          select: { id: true, name: true, type: true, warehouse: true, currentBalance: true }
        }
      }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '盤點記錄不存在', 404);
    }

    const action = data.action || 'update';

    // ========== ACTION: UPDATE (edit draft/pending) ==========
    if (action === 'update') {
      if (existing.status !== 'pending') {
        return createErrorResponse(
          'CASH_COUNT_ALREADY_SUBMITTED',
          '只有待提交的盤點記錄可以修改',
          400
        );
      }

      const updateData = {};
      if (data.note !== undefined) updateData.note = data.note || null;
      if (data.countDate !== undefined) {
        updateData.countDate = data.countDate;
        const parts = data.countDate.split('-');
        updateData.countYear = parseInt(parts[0]);
        updateData.countMonth = parseInt(parts[1]);
      }

      // If details are provided, recalculate totals
      if (data.details && Array.isArray(data.details) && data.details.length > 0) {
        // Validate details
        for (const detail of data.details) {
          const denom = parseFloat(detail.denomination);
          if (isNaN(denom) || denom <= 0) {
            return createErrorResponse('CASH_COUNT_INVALID_INPUT', '面額必須為正數', 400);
          }
          if (detail.quantity < 0) {
            return createErrorResponse('CASH_COUNT_INVALID_INPUT', '清點數量不可為負數', 400);
          }
        }

        let actualBalance = 0;
        const processedDetails = data.details.map(d => {
          const denomination = parseFloat(d.denomination);
          const quantity = parseInt(d.quantity) || 0;
          const subtotal = denomination * quantity;
          actualBalance += subtotal;
          return { denomination, quantity, subtotal, note: d.note || null };
        });

        const systemBalance = Number(existing.systemBalance);
        const difference = systemBalance - actualBalance;

        let differenceType = 'balanced';
        if (Math.abs(difference) <= 1) {
          differenceType = 'balanced';
        } else if (difference < 0) {
          differenceType = 'surplus';
        } else {
          differenceType = 'shortage';
        }

        // Check shortage threshold
        const config = await prisma.cashCountConfig.findUnique({
          where: { accountId: existing.accountId }
        });
        const shortageThreshold = config ? Number(config.shortageThreshold) : 5000;
        const isAbnormal = differenceType === 'shortage' && Math.abs(difference) > shortageThreshold;

        updateData.actualBalance = actualBalance;
        updateData.difference = difference;
        updateData.differenceType = differenceType;
        updateData.isAbnormal = isAbnormal;

        // Delete old details and create new ones in transaction
        const result = await prisma.$transaction(async (tx) => {
          await tx.cashCountDetail.deleteMany({ where: { countId: id } });

          const updated = await tx.cashCount.update({
            where: { id },
            data: {
              ...updateData,
              details: {
                create: processedDetails
              }
            },
            include: {
              details: { orderBy: { denomination: 'desc' } },
              account: {
                select: { id: true, name: true, type: true, warehouse: true, currentBalance: true }
              }
            }
          });

          return updated;
        });

        return NextResponse.json(serializeCashCount(result));
      }

      // Simple update without details change
      const result = await prisma.cashCount.update({
        where: { id },
        data: updateData,
        include: {
          details: { orderBy: { denomination: 'desc' } },
          account: {
            select: { id: true, name: true, type: true, warehouse: true, currentBalance: true }
          }
        }
      });

      return NextResponse.json(serializeCashCount(result));
    }

    // ========== ACTION: CONFIRM (pending -> confirmed) ==========
    if (action === 'confirm') {
      if (existing.status !== 'pending') {
        return createErrorResponse(
          'CASH_COUNT_ALREADY_SUBMITTED',
          '此盤點記錄已提交或已完成，不可重複確認',
          400
        );
      }

      // If abnormal shortage, cannot confirm directly - must go through review
      if (existing.isAbnormal) {
        return createErrorResponse(
          'CASH_COUNT_SHORTAGE_EXCEED',
          '大額短缺需提交主管審核，無法直接確認',
          400
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        let cashTransactionId = null;
        const differenceType = existing.differenceType;
        const absDifference = Math.abs(Number(existing.difference));
        const accountId = existing.accountId;

        // Create adjustment transaction if there is a non-zero difference
        if (differenceType !== 'balanced') {
          const txNo = await generateTransactionNo(tx, existing.countDate);
          const account = await tx.cashAccount.findUnique({ where: { id: accountId } });

          if (differenceType === 'surplus') {
            const surplusCatId = await getCategoryId(tx, 'cash_count_adjustment');
            const newTx = await tx.cashTransaction.create({
              data: {
                transactionNo: txNo,
                transactionDate: existing.countDate,
                type: '收入',
                warehouse: account?.warehouse || null,
                accountId,
                categoryId: surplusCatId,
                amount: absDifference,
                fee: 0,
                hasFee: false,
                description: `現金盤點盈餘調整 (${existing.countNo})`,
                sourceType: 'cash_count_adjustment',
                status: '已確認'
              }
            });
            cashTransactionId = newTx.id;
          } else if (differenceType === 'shortage') {
            const shortageCatId = await getCategoryId(tx, 'cash_count_shortage');
            const newTx = await tx.cashTransaction.create({
              data: {
                transactionNo: txNo,
                transactionDate: existing.countDate,
                type: '支出',
                warehouse: account?.warehouse || null,
                accountId,
                categoryId: shortageCatId,
                amount: absDifference,
                fee: 0,
                hasFee: false,
                description: `現金盤點短缺 (${existing.countNo})`,
                sourceType: 'cash_count_shortage',
                status: '已確認'
              }
            });
            cashTransactionId = newTx.id;
          }

          // Recalculate account balance
          await recalcBalance(tx, accountId);
        }

        const updated = await tx.cashCount.update({
          where: { id },
          data: {
            status: 'confirmed',
            countedAt: new Date(),
            cashTransactionId
          },
          include: {
            details: { orderBy: { denomination: 'desc' } },
            account: {
              select: { id: true, name: true, type: true, warehouse: true, currentBalance: true }
            }
          }
        });

        return updated;
      });

      return NextResponse.json(serializeCashCount(result));
    }

    // ========== ACTION: APPROVE (pending abnormal -> approved) ==========
    if (action === 'approve') {
      if (existing.status !== 'pending') {
        return createErrorResponse(
          'CASH_COUNT_ALREADY_REVIEWED',
          '此盤點記錄不處於待審核狀態',
          400
        );
      }

      if (!data.reviewedByUserId) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '審核人員為必填', 400);
      }

      // Enforce separation of duties: reviewer cannot be the same as counter
      if (parseInt(data.reviewedByUserId) === existing.countedByUserId) {
        return createErrorResponse(
          'PERMISSION_DENIED',
          '您不可審核自己清點的盤點記錄',
          403
        );
      }

      if (!data.reviewNote) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '審核意見為必填', 400);
      }

      // Whether to create a cash transaction (default true)
      const createTransaction = data.createTransaction !== false;

      const result = await prisma.$transaction(async (tx) => {
        let cashTransactionId = null;

        if (createTransaction) {
          const absDifference = Math.abs(Number(existing.difference));
          const accountId = existing.accountId;
          const account = await tx.cashAccount.findUnique({ where: { id: accountId } });
          const txNo = await generateTransactionNo(tx, existing.countDate);

          if (existing.differenceType === 'shortage') {
            const shortageCatId2 = await getCategoryId(tx, 'cash_count_shortage');
            const newTx = await tx.cashTransaction.create({
              data: {
                transactionNo: txNo,
                transactionDate: existing.countDate,
                type: '支出',
                warehouse: account?.warehouse || null,
                accountId,
                categoryId: shortageCatId2,
                amount: absDifference,
                fee: 0,
                hasFee: false,
                description: `現金盤點短缺（已審核核准）(${existing.countNo})`,
                sourceType: 'cash_count_shortage',
                status: '已確認'
              }
            });
            cashTransactionId = newTx.id;
          } else if (existing.differenceType === 'surplus') {
            const surplusCatId2 = await getCategoryId(tx, 'cash_count_adjustment');
            const newTx = await tx.cashTransaction.create({
              data: {
                transactionNo: txNo,
                transactionDate: existing.countDate,
                type: '收入',
                warehouse: account?.warehouse || null,
                accountId,
                categoryId: surplusCatId2,
                amount: absDifference,
                fee: 0,
                hasFee: false,
                description: `現金盤點盈餘調整（已審核核准）(${existing.countNo})`,
                sourceType: 'cash_count_adjustment',
                status: '已確認'
              }
            });
            cashTransactionId = newTx.id;
          }

          if (cashTransactionId) {
            await recalcBalance(tx, existing.accountId);
          }
        }

        const updated = await tx.cashCount.update({
          where: { id },
          data: {
            status: 'approved',
            reviewedByUserId: parseInt(data.reviewedByUserId),
            reviewedAt: new Date(),
            reviewNote: data.reviewNote,
            cashTransactionId
          },
          include: {
            details: { orderBy: { denomination: 'desc' } },
            account: {
              select: { id: true, name: true, type: true, warehouse: true, currentBalance: true }
            }
          }
        });

        return updated;
      });

      return NextResponse.json(serializeCashCount(result));
    }

    // ========== ACTION: REJECT (pending -> void) ==========
    if (action === 'reject') {
      if (existing.status !== 'pending') {
        return createErrorResponse(
          'CASH_COUNT_ALREADY_REVIEWED',
          '此盤點記錄不處於待審核狀態',
          400
        );
      }

      if (!data.reviewedByUserId) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '審核人員為必填', 400);
      }

      // Enforce separation of duties
      if (parseInt(data.reviewedByUserId) === existing.countedByUserId) {
        return createErrorResponse(
          'PERMISSION_DENIED',
          '您不可審核自己清點的盤點記錄',
          403
        );
      }

      if (!data.reviewNote) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '退回原因為必填', 400);
      }

      const result = await prisma.cashCount.update({
        where: { id },
        data: {
          status: 'void',
          reviewedByUserId: parseInt(data.reviewedByUserId),
          reviewedAt: new Date(),
          reviewNote: data.reviewNote
        },
        include: {
          details: { orderBy: { denomination: 'desc' } },
          account: {
            select: { id: true, name: true, type: true, warehouse: true, currentBalance: true }
          }
        }
      });

      return NextResponse.json(serializeCashCount(result));
    }

    // ========== ACTION: UNLOCK (confirmed/approved -> pending, admin only) ==========
    if (action === 'unlock') {
      if (existing.status !== 'confirmed' && existing.status !== 'approved') {
        return createErrorResponse(
          'VALIDATION_FAILED',
          '只有已確認或已審核的盤點記錄可以解鎖',
          400
        );
      }

      if (!data.unlockReason) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '解鎖原因為必填', 400);
      }

      const result = await prisma.$transaction(async (tx) => {
        // If there is a linked transaction, reverse it (delete and recalc)
        if (existing.cashTransactionId) {
          const linkedTx = await tx.cashTransaction.findUnique({
            where: { id: existing.cashTransactionId }
          });
          if (linkedTx) {
            await tx.cashTransaction.delete({ where: { id: linkedTx.id } });
            await recalcBalance(tx, existing.accountId);
          }
        }

        const updated = await tx.cashCount.update({
          where: { id },
          data: {
            status: 'pending',
            cashTransactionId: null,
            reviewedByUserId: null,
            reviewedAt: null,
            reviewNote: null,
            note: `${existing.note ? existing.note + '\n' : ''}[解鎖] ${data.unlockReason}`
          },
          include: {
            details: { orderBy: { denomination: 'desc' } },
            account: {
              select: { id: true, name: true, type: true, warehouse: true, currentBalance: true }
            }
          }
        });

        return updated;
      });

      return NextResponse.json(serializeCashCount(result));
    }

    return createErrorResponse('VALIDATION_FAILED', `不支援的操作: ${action}`, 400);
  } catch (error) {
    return handleApiError(error);
  }
}

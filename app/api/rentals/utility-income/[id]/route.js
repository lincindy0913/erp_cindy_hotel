import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { assertRentalYearOpen } from '@/lib/rental-year-lock';
import { assertPeriodOpen } from '@/lib/period-lock';
import { getCategoryId } from '@/lib/cash-category-helper';
import { todayStr } from '@/lib/localDate';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';

async function isBankMatched(cashTransactionId) {
  if (!cashTransactionId) return false;
  const count = await prisma.bankStatementLine.count({
    where: { matchedTransactionId: cashTransactionId },
  });
  return count > 0;
}

// GET: 取單筆
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const incomeId = parseInt((await params).id);
    const record = await prisma.rentalUtilityIncome.findUnique({
      where: { id: incomeId },
      include: { property: { select: { id: true, name: true } } },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到水電收入紀錄', 404);
    return NextResponse.json(record);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH: 更新水電收入（金額／日期／帳戶／備註），同步 CashTransaction
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const incomeId = parseInt((await params).id);
    const record = await prisma.rentalUtilityIncome.findUnique({
      where: { id: incomeId },
      include: { property: { select: { id: true, name: true } } },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到水電收入紀錄', 404);

    await assertRentalYearOpen(record.incomeYear);

    const body = await request.json();
    const { expectedAmount, actualAmount, actualDate, accountId, note } = body;

    const bankMatched = await isBankMatched(record.cashTransactionId);

    // 若已銀行對帳，封鎖金融欄位修改
    const financialFields = ['actualAmount', 'actualDate', 'accountId'];
    const wantsFinancialChange = financialFields.some(f => f in body);
    if (bankMatched && wantsFinancialChange) {
      return createErrorResponse(
        'CONFLICT',
        '此筆水電收入的出納記錄已與銀行對帳，無法修改金額／日期／帳戶，請先解除對帳。',
        409
      );
    }

    const updateData = {};
    if (expectedAmount !== undefined) updateData.expectedAmount = parseFloat(expectedAmount) || 0;
    if (note !== undefined) updateData.note = note || null;

    if (!bankMatched) {
      if (actualAmount !== undefined) {
        const amt = actualAmount !== '' && actualAmount != null ? parseFloat(actualAmount) : null;
        updateData.actualAmount = amt;
        updateData.status = amt != null ? 'completed' : 'pending';
      }
      if (actualDate !== undefined) updateData.actualDate = actualDate || null;
      if (accountId !== undefined) updateData.accountId = accountId ? parseInt(accountId) : null;
    }

    // RT3: 月結期間鎖定（以 actualDate 優先，否則用月份第一天）
    const lockDate = (updateData.actualDate ?? record.actualDate)
      || `${record.incomeYear}-${String(record.incomeMonth).padStart(2, '0')}-01`;
    const warehouse = null;  // 租屋物業無館別 → 走全域月結鎖

    let finalRecord;
    await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, lockDate, warehouse);

      const updated = await tx.rentalUtilityIncome.update({
        where: { id: incomeId },
        data: updateData,
        include: { property: { select: { id: true, name: true } } },
      });

      // 同步 CashTransaction（RT2: 帶入 warehouse）
      if (!bankMatched) {
        const hasAmount  = updated.actualAmount && Number(updated.actualAmount) > 0;
        const hasAccount = updated.accountId;
        const description = `水電收入 - ${updated.property?.name || '物業'} - ${updated.incomeYear}/${updated.incomeMonth}`;

        if (updated.cashTransactionId) {
          if (!hasAmount || !hasAccount) {
            await tx.rentalUtilityIncome.update({ where: { id: incomeId }, data: { cashTransactionId: null } });
            await tx.cashTransaction.delete({ where: { id: updated.cashTransactionId } });
            await recalcBalance(tx, updated.accountId ?? record.accountId);
          } else {
            await tx.cashTransaction.update({
              where: { id: updated.cashTransactionId },
              data: {
                amount: Number(updated.actualAmount),
                transactionDate: updated.actualDate || todayStr(),
                accountId: updated.accountId,
                warehouse: null,  // 租屋物業無館別
                description,
              },
            });
            await recalcBalance(tx, updated.accountId);
            if (record.accountId && record.accountId !== updated.accountId) {
              await recalcBalance(tx, record.accountId);
            }
          }
        } else if (hasAmount && hasAccount) {
          const categoryId = await getCategoryId(tx, 'rental_income');
          const txNo = await nextCashTransactionNo(tx, updated.actualDate);
          const cashTx = await tx.cashTransaction.create({
            data: {
              transactionNo:   txNo,
              transactionDate: updated.actualDate || todayStr(),
              type:            '收入',
              warehouse:       null,  // 租屋物業無館別
              accountId:       updated.accountId,
              categoryId,
              amount:          Number(updated.actualAmount),
              description,
              sourceType:      'rental_income',
              sourceRecordId:  incomeId,
              status:          '已確認',
            },
            select: { id: true },
          });
          await tx.rentalUtilityIncome.update({ where: { id: incomeId }, data: { cashTransactionId: cashTx.id } });
          await recalcBalance(tx, updated.accountId);
        }
      }

      finalRecord = updated;
    });

    return NextResponse.json({
      ...finalRecord,
      actualAmount: finalRecord.actualAmount ? Number(finalRecord.actualAmount) : null,
    });
  } catch (error) {
    console.error('PATCH /api/rentals/utility-income/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

// DELETE: 刪除水電收入，連動刪除 CashTransaction（先確認無銀行對帳）
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const incomeId = parseInt((await params).id);
    const record = await prisma.rentalUtilityIncome.findUnique({
      where: { id: incomeId },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到水電收入紀錄', 404);

    await assertRentalYearOpen(record.incomeYear);

    if (record.cashTransactionId && await isBankMatched(record.cashTransactionId)) {
      return createErrorResponse(
        'CONFLICT',
        '此筆水電收入的出納記錄已與銀行對帳，無法刪除，請先解除對帳。',
        409
      );
    }

    const lockDate = record.actualDate
      || `${record.incomeYear}-${String(record.incomeMonth).padStart(2, '0')}-01`;

    await prisma.$transaction(async (tx) => {
      // RT3: 月結鎖定（租屋物業無館別 → 走全域月結鎖）
      await assertPeriodOpen(tx, lockDate, null);

      if (record.cashTransactionId) {
        const cashTx = await tx.cashTransaction.findUnique({
          where: { id: record.cashTransactionId },
          select: { accountId: true },
        });
        await tx.rentalUtilityIncome.update({ where: { id: incomeId }, data: { cashTransactionId: null } });
        await tx.cashTransaction.delete({ where: { id: record.cashTransactionId } });
        if (cashTx) await recalcBalance(tx, cashTx.accountId);
      }

      await tx.rentalUtilityIncome.delete({ where: { id: incomeId } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/utility-income/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

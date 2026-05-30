import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { assertRentalYearOpen } from '@/lib/rental-year-lock';
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

    const updated = await prisma.rentalUtilityIncome.update({
      where: { id: incomeId },
      data: updateData,
      include: { property: { select: { id: true, name: true } } },
    });

    // 同步 CashTransaction
    if (!bankMatched) {
      const hasAmount  = updated.actualAmount && Number(updated.actualAmount) > 0;
      const hasAccount = updated.accountId;

      if (updated.cashTransactionId) {
        if (!hasAmount || !hasAccount) {
          // 清除金額或帳戶 → 刪除 cashTx
          await prisma.rentalUtilityIncome.update({ where: { id: incomeId }, data: { cashTransactionId: null } });
          await prisma.cashTransaction.delete({ where: { id: updated.cashTransactionId } });
          await recalcBalance(prisma, updated.accountId ?? record.accountId);
        } else {
          // 更新 cashTx
          const description = `水電收入 - ${updated.property?.name || '物業'} - ${updated.incomeYear}/${updated.incomeMonth}`;
          await prisma.cashTransaction.update({
            where: { id: updated.cashTransactionId },
            data: {
              amount: Number(updated.actualAmount),
              transactionDate: updated.actualDate || todayStr(),
              accountId: updated.accountId,
              description,
            },
          });
          await recalcBalance(prisma, updated.accountId);
          if (record.accountId && record.accountId !== updated.accountId) {
            await recalcBalance(prisma, record.accountId);
          }
        }
      } else if (hasAmount && hasAccount) {
        // 新建 cashTx
        const categoryId = await getCategoryId(prisma, 'rental_income');
        const txNo = await nextCashTransactionNo(prisma, updated.actualDate);
        const description = `水電收入 - ${updated.property?.name || '物業'} - ${updated.incomeYear}/${updated.incomeMonth}`;
        const tx = await prisma.cashTransaction.create({
          data: {
            transactionNo: txNo,
            transactionDate: updated.actualDate || todayStr(),
            type: '收入',
            accountId: updated.accountId,
            categoryId,
            amount: Number(updated.actualAmount),
            description,
            sourceType: 'rental_income',
            sourceRecordId: incomeId,
            status: '已確認',
          },
          select: { id: true },
        });
        await prisma.rentalUtilityIncome.update({ where: { id: incomeId }, data: { cashTransactionId: tx.id } });
        await recalcBalance(prisma, updated.accountId);
      }
    }

    return NextResponse.json({ ...updated, actualAmount: updated.actualAmount ? Number(updated.actualAmount) : null });
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
    const record = await prisma.rentalUtilityIncome.findUnique({ where: { id: incomeId } });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到水電收入紀錄', 404);

    await assertRentalYearOpen(record.incomeYear);

    if (record.cashTransactionId) {
      if (await isBankMatched(record.cashTransactionId)) {
        return createErrorResponse(
          'CONFLICT',
          '此筆水電收入的出納記錄已與銀行對帳，無法刪除，請先解除對帳。',
          409
        );
      }

      const cashTx = await prisma.cashTransaction.findUnique({
        where: { id: record.cashTransactionId },
        select: { accountId: true },
      });
      await prisma.rentalUtilityIncome.update({ where: { id: incomeId }, data: { cashTransactionId: null } });
      await prisma.cashTransaction.delete({ where: { id: record.cashTransactionId } });
      if (cashTx) await recalcBalance(prisma, cashTx.accountId);
    }

    await prisma.rentalUtilityIncome.delete({ where: { id: incomeId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/utility-income/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

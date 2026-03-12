import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getCategoryId } from '@/lib/cash-category-helper';

export const dynamic = 'force-dynamic';

async function ensureUtilityIncomeCashTx(prismaClient, record) {
  if (!record.actualAmount || !record.accountId || record.cashTransactionId) return;
  const amt = Number(record.actualAmount);
  const acctId = record.accountId;
  const categoryId = await getCategoryId(prismaClient, 'rental_income');
  const category = categoryId
    ? await prismaClient.cashCategory.findUnique({
        where: { id: categoryId },
        include: { accountingSubject: { select: { code: true, name: true } } }
      })
    : null;
  const accountingSubjectLabel = category?.accountingSubject
    ? `${category.accountingSubject.code || ''} ${category.accountingSubject.name || ''}`.trim()
    : null;
  const dateStr = (record.actualDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;
  const existing = await prismaClient.cashTransaction.findMany({
    where: { transactionNo: { startsWith: prefix } },
    select: { transactionNo: true }
  });
  let maxSeq = 0;
  for (const t of existing) {
    const seq = parseInt(t.transactionNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }
  const txNo = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  const description = `水電收入 - ${record.property?.name || '物業'} - ${record.incomeYear}/${record.incomeMonth}`;
  const tx = await prismaClient.cashTransaction.create({
    data: {
      transactionNo: txNo,
      transactionDate: record.actualDate || new Date().toISOString().split('T')[0],
      type: '收入',
      accountId: acctId,
      categoryId,
      accountingSubject: accountingSubjectLabel,
      amount: amt,
      description,
      sourceType: 'rental_income',
      sourceRecordId: record.id,
      status: '已確認'
    }
  });
  await prismaClient.rentalUtilityIncome.update({
    where: { id: record.id },
    data: { cashTransactionId: tx.id }
  });
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const incomeId = parseInt(id);
    const body = await request.json();

    const record = await prisma.rentalUtilityIncome.findUnique({
      where: { id: incomeId },
      include: { property: { select: { name: true } } }
    });
    if (!record) {
      return createErrorResponse('NOT_FOUND', '找不到水電收入紀錄', 404);
    }

    const expectedAmount = body.expectedAmount != null && body.expectedAmount !== '' ? parseFloat(body.expectedAmount) : Number(record.expectedAmount);
    const actualAmount = body.actualAmount != null && body.actualAmount !== '' ? parseFloat(body.actualAmount) : null;
    const actualDate = body.actualDate || record.actualDate;
    const accountId = body.accountId ? parseInt(body.accountId) : record.accountId;
    const status = actualAmount != null && actualAmount > 0 ? 'completed' : 'pending';

    const updated = await prisma.rentalUtilityIncome.update({
      where: { id: incomeId },
      data: {
        expectedAmount,
        actualAmount,
        actualDate,
        accountId,
        status,
        note: body.note != null ? body.note : record.note
      },
      include: { property: { select: { name: true } } }
    });

    if (updated.actualAmount && updated.accountId && !updated.cashTransactionId) {
      await ensureUtilityIncomeCashTx(prisma, updated);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/rentals/utility-income/[id] error:', error);
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const incomeId = parseInt(id);
    await prisma.rentalUtilityIncome.delete({ where: { id: incomeId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/utility-income/[id] error:', error);
    return handleApiError(error);
  }
}

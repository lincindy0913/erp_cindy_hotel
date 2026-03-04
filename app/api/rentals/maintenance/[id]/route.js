import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

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

// Recalculate account balance
async function recalcBalance(accountId) {
  const incomes = await prisma.cashTransaction.aggregate({
    where: { accountId, type: '收入' },
    _sum: { amount: true }
  });
  const expenses = await prisma.cashTransaction.aggregate({
    where: { accountId, type: '支出' },
    _sum: { amount: true }
  });
  const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
  const newBalance = Number(account.openingBalance) + Number(incomes._sum.amount || 0) - Number(expenses._sum.amount || 0);
  await prisma.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: newBalance }
  });
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const maintenanceId = parseInt(id);
    const body = await request.json();

    const { accountId, paymentDate } = body;

    if (!accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇付款帳戶', 400);
    }

    const record = await prisma.rentalMaintenance.findUnique({
      where: { id: maintenanceId },
      include: {
        property: { select: { name: true } }
      }
    });

    if (!record) {
      return createErrorResponse('NOT_FOUND', '找不到維護紀錄', 404);
    }

    const acctId = parseInt(accountId);
    const txDate = paymentDate || new Date().toISOString().split('T')[0];
    const transactionNo = await generateTransactionNo(txDate);

    // Create CashTransaction
    const tx = await prisma.cashTransaction.create({
      data: {
        transactionNo,
        transactionDate: txDate,
        type: '支出',
        accountId: acctId,
        amount: Number(record.amount),
        description: `維護費用 - ${record.property.name} - ${record.category}`,
        sourceType: 'rental_maintenance',
        sourceRecordId: maintenanceId,
        status: '已確認'
      }
    });

    // Update maintenance record
    await prisma.rentalMaintenance.update({
      where: { id: maintenanceId },
      data: {
        status: 'paid',
        cashTransactionId: tx.id
      }
    });

    // Recalculate balance
    await recalcBalance(acctId);

    return NextResponse.json({ success: true, transactionId: tx.id });
  } catch (error) {
    console.error('PUT /api/rentals/maintenance/[id] error:', error);
    return handleApiError(error);
  }
}

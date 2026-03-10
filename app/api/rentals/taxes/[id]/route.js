import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
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
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const taxId = parseInt(id);
    const body = await request.json();

    const { accountId, paymentDate } = body;

    if (!accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇付款帳戶', 400);
    }

    const tax = await prisma.propertyTax.findUnique({
      where: { id: taxId },
      include: {
        property: { select: { name: true } }
      }
    });

    if (!tax) {
      return createErrorResponse('NOT_FOUND', '找不到稅款紀錄', 404);
    }

    const acctId = parseInt(accountId);
    const txDate = paymentDate || new Date().toISOString().split('T')[0];
    const transactionNo = await generateTransactionNo(txDate);

    // Create CashTransaction for tax payment
    const categoryId = await getCategoryId(prisma, 'rental_tax');
    const tx = await prisma.cashTransaction.create({
      data: {
        transactionNo,
        transactionDate: txDate,
        type: '支出',
        accountId: acctId,
        categoryId,
        amount: Number(tax.amount),
        description: `房屋稅款 - ${tax.property.name} - ${tax.taxYear} ${tax.taxType}`,
        sourceType: 'rental_tax',
        sourceRecordId: taxId,
        status: '已確認'
      }
    });

    // Update tax record
    await prisma.propertyTax.update({
      where: { id: taxId },
      data: {
        status: 'paid',
        cashTransactionId: tx.id,
        confirmedAt: new Date(),
        confirmedBy: body.confirmedBy || null
      }
    });

    // Recalculate balance
    await recalcBalance(acctId);

    return NextResponse.json({ success: true, transactionId: tx.id });
  } catch (error) {
    console.error('PUT /api/rentals/taxes/[id] error:', error);
    return handleApiError(error);
  }
}

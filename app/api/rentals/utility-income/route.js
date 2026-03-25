import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getCategoryId } from '@/lib/cash-category-helper';

export const dynamic = 'force-dynamic';

async function generateTxNo(prismaClient, date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
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
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

async function ensureUtilityIncomeCashTx(prismaClient, record) {
  if (!record.actualAmount || !record.accountId || record.cashTransactionId) return record;
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
  const txNo = await generateTxNo(prismaClient, record.actualDate);
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
  return { ...record, cashTransactionId: tx.id };
}

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const propertyId = searchParams.get('propertyId');

    const where = {};
    if (year) where.incomeYear = parseInt(year);
    if (month) where.incomeMonth = parseInt(month);
    if (propertyId) where.propertyId = parseInt(propertyId);

    const list = await prisma.rentalUtilityIncome.findMany({
      where,
      include: {
        property: { select: { id: true, name: true, buildingName: true } }
      },
      orderBy: [{ incomeYear: 'desc' }, { incomeMonth: 'desc' }, { propertyId: 'asc' }]
    });

    const result = list.map(u => ({
      ...u,
      propertyName: u.property.name
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/rentals/utility-income error:', error.message || error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { propertyId, incomeYear, incomeMonth, expectedAmount, actualAmount, actualDate, accountId, note } = body;

    if (!propertyId || !incomeYear || !incomeMonth) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '物業、年份、月份為必填', 400);
    }

    const y = parseInt(incomeYear);
    const m = parseInt(incomeMonth);
    const expected = expectedAmount != null && expectedAmount !== '' ? parseFloat(expectedAmount) : 0;

    const created = await prisma.rentalUtilityIncome.upsert({
      where: {
        propertyId_incomeYear_incomeMonth: {
          propertyId: parseInt(propertyId),
          incomeYear: y,
          incomeMonth: m
        }
      },
      create: {
        propertyId: parseInt(propertyId),
        incomeYear: y,
        incomeMonth: m,
        expectedAmount: expected,
        actualAmount: actualAmount != null && actualAmount !== '' ? parseFloat(actualAmount) : null,
        actualDate: actualDate || null,
        status: actualAmount != null && actualAmount !== '' ? 'completed' : 'pending',
        accountId: accountId ? parseInt(accountId) : null,
        note: note || null
      },
      update: {
        expectedAmount: expected,
        actualAmount: actualAmount != null && actualAmount !== '' ? parseFloat(actualAmount) : null,
        actualDate: actualDate || null,
        status: actualAmount != null && actualAmount !== '' ? 'completed' : 'pending',
        accountId: accountId ? parseInt(accountId) : null,
        note: note || null
      },
      include: {
        property: { select: { id: true, name: true } }
      }
    });

    if (created.actualAmount && created.accountId && !created.cashTransactionId) {
      await ensureUtilityIncomeCashTx(prisma, created);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('POST /api/rentals/utility-income error:', error.message || error);
    return handleApiError(error);
  }
}

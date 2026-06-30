import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getCategoryId } from '@/lib/cash-category-helper';
import { todayStr } from '@/lib/localDate';
import { nextCashTransactionNo } from '@/lib/sequence-generator';
import { assertRentalYearOpen } from '@/lib/rental-year-lock';
import { assertPeriodOpen } from '@/lib/period-lock';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year       = searchParams.get('year');
    const month      = searchParams.get('month');
    const propertyId = searchParams.get('propertyId');

    const where = {};
    if (year)       where.incomeYear  = parseInt(year);
    if (month)      where.incomeMonth = parseInt(month);
    if (propertyId) where.propertyId  = parseInt(propertyId);

    const list = await prisma.rentalUtilityIncome.findMany({
      where,
      include: {
        property: { select: { id: true, name: true, buildingName: true, sortOrder: true } },
      },
      orderBy: [{ incomeYear: 'desc' }, { incomeMonth: 'desc' }, { propertyId: 'asc' }],
    });

    return NextResponse.json(list.map(u => ({ ...u, propertyName: u.property.name, sortOrder: u.property.sortOrder })));
  } catch (error) {
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

    await assertRentalYearOpen(y);

    const property = await prisma.rentalProperty.findUnique({
      where: { id: parseInt(propertyId) },
      select: { id: true, name: true },
    });
    if (!property) return createErrorResponse('NOT_FOUND', '找不到物業', 404);

    const expected = expectedAmount != null && expectedAmount !== '' ? parseFloat(expectedAmount) : 0;
    const actual   = actualAmount   != null && actualAmount   !== '' ? parseFloat(actualAmount)   : null;
    const acctId   = accountId ? parseInt(accountId) : null;
    // RT3: 月結期間鎖定日期（以 actualDate 優先，否則用月份第一天）
    const lockDate = actualDate || `${y}-${String(m).padStart(2, '0')}-01`;

    let resultId;

    // RT1: upsert + cashTransaction 包在同一 $transaction
    await prisma.$transaction(async (tx) => {
      // RT3: 月結鎖定（租屋物業無館別 → 走全域月結鎖）
      await assertPeriodOpen(tx, lockDate, null);

      const created = await tx.rentalUtilityIncome.upsert({
        where: {
          propertyId_incomeYear_incomeMonth: { propertyId: parseInt(propertyId), incomeYear: y, incomeMonth: m },
        },
        create: {
          propertyId: parseInt(propertyId),
          incomeYear: y,
          incomeMonth: m,
          expectedAmount: expected,
          actualAmount: actual,
          actualDate: actualDate || null,
          status: actual != null ? 'completed' : 'pending',
          accountId: acctId,
          note: note || null,
        },
        update: {
          expectedAmount: expected,
          actualAmount: actual,
          actualDate: actualDate || null,
          status: actual != null ? 'completed' : 'pending',
          accountId: acctId,
          note: note || null,
        },
      });
      resultId = created.id;

      // 建立 cashTransaction（RT2: 帶入 warehouse）
      if (actual && acctId && !created.cashTransactionId) {
        const categoryId = await getCategoryId(tx, 'rental_income');
        const category   = categoryId
          ? await tx.cashCategory.findUnique({
              where: { id: categoryId },
              include: { accountingSubject: { select: { code: true, name: true } } },
            })
          : null;
        const accountingSubjectLabel = category?.accountingSubject
          ? `${category.accountingSubject.code || ''} ${category.accountingSubject.name || ''}`.trim()
          : null;
        const txNo       = await nextCashTransactionNo(tx, actualDate);
        const description = `水電收入 - ${property.name} - ${y}/${m}`;
        const cashTx = await tx.cashTransaction.create({
          data: {
            transactionNo:   txNo,
            transactionDate: actualDate || todayStr(),
            type:            '收入',
            warehouse:       null,  // 租屋物業無館別
            accountId:       acctId,
            categoryId,
            accountingSubject: accountingSubjectLabel,
            amount:          actual,
            description,
            sourceType:      'rental_income',
            sourceRecordId:  created.id,
            status:          '已確認',
          },
          select: { id: true },
        });
        await tx.rentalUtilityIncome.update({
          where: { id: created.id },
          data:  { cashTransactionId: cashTx.id },
        });
      }
    });

    const result = await prisma.rentalUtilityIncome.findUnique({
      where: { id: resultId },
      include: { property: { select: { id: true, name: true } } },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

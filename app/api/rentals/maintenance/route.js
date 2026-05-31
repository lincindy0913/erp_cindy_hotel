import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { localDateStr } from '@/lib/localDate';
import { nextSequence } from '@/lib/sequence-generator';
import { assertRentalYearOpen } from '@/lib/rental-year-lock';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const year = searchParams.get('year');

    const where = {};
    if (propertyId) where.propertyId = parseInt(propertyId);
    if (status) where.status = status;
    if (category) where.category = category;
    if (year) where.maintenanceDate = { startsWith: String(year) };

    const TAKE = 500;
    const records = await prisma.rentalMaintenance.findMany({
      where,
      include: {
        property: { select: { id: true, name: true, buildingName: true } }
      },
      orderBy: { maintenanceDate: 'desc' },
      take: TAKE + 1,
    });

    const hasMore = records.length > TAKE;
    const slice   = hasMore ? records.slice(0, TAKE) : records;
    return NextResponse.json(slice, hasMore ? { headers: { 'X-Has-More': 'true' } } : {});
  } catch (error) {
    console.error('GET /api/rentals/maintenance error:', error.message || error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { propertyId, maintenanceDate, category, amount, accountingSubjectId, accountId, isEmployeeAdvance, advancedBy, advancePaymentMethod } = body;

    if (!propertyId || !maintenanceDate || !category || !amount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }

    await assertRentalYearOpen(parseInt(maintenanceDate.substring(0, 4)));
    if (!accountingSubjectId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇會計科目', 400);
    }
    if (!accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇支出戶頭（同步至出納待出納）', 400);
    }

    const amt = parseFloat(amount);
    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.rentalMaintenance.create({
        data: {
          propertyId: parseInt(propertyId),
          maintenanceDate,
          category,
          amount: amt,
          accountingSubjectId: parseInt(accountingSubjectId),
          supplierId: body.supplierId ? parseInt(body.supplierId) : null,
          status: 'pending',
          isEmployeeAdvance: !!isEmployeeAdvance,
          advancedBy: isEmployeeAdvance ? (advancedBy || null) : null,
          advancePaymentMethod: isEmployeeAdvance ? (advancePaymentMethod || '現金') : null,
          note: body.note || null,
          isCapitalized: !!body.isCapitalized,
          isRecurring: !!body.isRecurring,
        },
        include: {
          property: { select: { id: true, name: true, buildingName: true } }
        }
      });

      const now = new Date();
      const dateStr = localDateStr(now).replace(/-/g, '');
      const prefix = `RENT-${dateStr}-`;
      const orderNo = await nextSequence(tx, 'paymentOrder', 'orderNo', prefix);

      const advanceLabel = isEmployeeAdvance && advancedBy ? ` (員工代墊: ${advancedBy})` : '';
      const summary = `租賃維護費 - ${record.property.name} - ${record.category}${advanceLabel}`;
      const order = await tx.paymentOrder.create({
        data: {
          orderNo,
          invoiceIds: [],
          // R18：員工代墊時受款人改為員工（而非廠商），出納用現金/轉帳還員工
          supplierId:    isEmployeeAdvance ? null : record.supplierId,
          supplierName:  isEmployeeAdvance ? (advancedBy || '員工代墊') : null,
          warehouse: null,
          paymentMethod: isEmployeeAdvance ? (advancePaymentMethod || '現金') : '轉帳',
          amount: amt,
          discount: 0,
          netAmount: amt,
          dueDate: maintenanceDate,
          accountId: parseInt(accountId),
          summary,
          note: isEmployeeAdvance
            ? `【員工代墊還款】請直接還款給員工 ${advancedBy || ''}，而非廠商。${body.note ? '\n' + body.note : ''}`
            : (body.note || null),
          status: '待出納',
          createdBy: session?.user?.email || null
        }
      });

      await tx.rentalMaintenance.update({
        where: { id: record.id },
        data: { paymentOrderId: order.id }
      });

      return { ...record, paymentOrderId: order.id, paymentOrderNo: order.orderNo };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('POST /api/rentals/maintenance error:', error.message || error);
    return handleApiError(error);
  }
}

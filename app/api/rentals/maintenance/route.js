import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const status = searchParams.get('status');
    const category = searchParams.get('category');

    const where = {};
    if (propertyId) where.propertyId = parseInt(propertyId);
    if (status) where.status = status;
    if (category) where.category = category;

    const records = await prisma.rentalMaintenance.findMany({
      where,
      include: {
        property: { select: { id: true, name: true, buildingName: true } }
      },
      orderBy: { maintenanceDate: 'desc' }
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error('GET /api/rentals/maintenance error:', error);
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
          note: body.note || null
        },
        include: {
          property: { select: { id: true, name: true, buildingName: true } }
        }
      });

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const prefix = `RENT-${dateStr}-`;
      const existing = await tx.paymentOrder.findMany({
        where: { orderNo: { startsWith: prefix } },
        select: { orderNo: true }
      });
      let maxSeq = 0;
      for (const item of existing) {
        const seq = parseInt(item.orderNo.substring(prefix.length)) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
      const orderNo = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;

      const advanceLabel = isEmployeeAdvance && advancedBy ? ` (員工代墊: ${advancedBy})` : '';
      const summary = `租賃維護費 - ${record.property.name} - ${record.category}${advanceLabel}`;
      const order = await tx.paymentOrder.create({
        data: {
          orderNo,
          invoiceIds: [],
          supplierId: record.supplierId,
          supplierName: null,
          warehouse: null,
          paymentMethod: '轉帳',
          amount: amt,
          discount: 0,
          netAmount: amt,
          dueDate: maintenanceDate,
          accountId: parseInt(accountId),
          summary,
          note: body.note || null,
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
    console.error('POST /api/rentals/maintenance error:', error);
    return handleApiError(error);
  }
}

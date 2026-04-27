import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const taxYear = searchParams.get('taxYear');
    const status = searchParams.get('status');
    const propertyId = searchParams.get('propertyId');

    const where = {};
    if (taxYear) where.taxYear = parseInt(taxYear);
    if (status) where.status = status;
    if (propertyId) where.propertyId = parseInt(propertyId);

    const taxes = await prisma.propertyTax.findMany({
      where,
      include: {
        property: {
          select: {
            id: true, name: true, buildingName: true,
            asset: { select: { id: true, hasHouseTax: true, hasLandTax: true, hasMaintenanceFee: true } },
          },
        },
      },
      orderBy: [{ taxYear: 'desc' }, { dueDate: 'asc' }],
      take: 500,
    });

    return NextResponse.json(taxes);
  } catch (error) {
    console.error('GET /api/rentals/taxes error:', error.message || error);
    return handleApiError(error);
  }
}

async function createPaymentOrderForTax(tx, tax) {
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
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
  const amt = Number(tax.amount);
  const summary = `房屋稅款 - ${tax.property.name} - ${tax.taxYear} ${tax.taxType}`;
  const order = await tx.paymentOrder.create({
    data: {
      orderNo,
      invoiceIds: [],
      supplierName: summary,
      paymentMethod: '轉帳',
      amount: amt,
      discount: 0,
      netAmount: amt,
      dueDate: tax.dueDate,
      summary,
      status: '待出納'
    }
  });
  return order;
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const body = await request.json();
    const { propertyId, taxYear, taxType, dueDate, amount } = body;

    if (!propertyId || !taxYear || !taxType || !dueDate || !amount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const tax = await tx.propertyTax.create({
        data: {
          propertyId: parseInt(propertyId),
          taxYear: parseInt(taxYear),
          taxType,
          dueDate,
          amount: parseFloat(amount),
          status: 'pending',
          certNo: body.certNo?.trim() || null,
          paidDate: body.paidDate || null,
          note: body.note?.trim() || null,
        },
        include: {
          property: { select: { id: true, name: true, buildingName: true } }
        }
      });
      const order = await createPaymentOrderForTax(tx, tax);
      await tx.propertyTax.update({
        where: { id: tax.id },
        data: { paymentOrderId: order.id }
      });
      return { ...tax, paymentOrderId: order.id, paymentOrderNo: order.orderNo };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('POST /api/rentals/taxes error:', error.message || error);
    return handleApiError(error);
  }
}

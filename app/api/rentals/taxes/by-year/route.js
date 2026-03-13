import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const LAND_TAX = '地價稅';
const HOUSE_TAX = '房屋稅';
const TAX_TYPES = [LAND_TAX, HOUSE_TAX];

/**
 * GET ?year=2025
 * Returns properties and tax amounts for table: 門牌 | 地價稅 | 房屋稅
 */
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    if (Number.isNaN(y)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }

    const [properties, taxes] = await Promise.all([
      prisma.rentalProperty.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, address: true, buildingName: true, unitNo: true }
      }),
      prisma.propertyTax.findMany({
        where: { taxYear: y, taxType: { in: TAX_TYPES } },
        select: { propertyId: true, taxType: true, amount: true }
      })
    ]);

    const taxMap = {};
    for (const t of taxes) {
      if (!taxMap[t.propertyId]) taxMap[t.propertyId] = { [LAND_TAX]: 0, [HOUSE_TAX]: 0 };
      taxMap[t.propertyId][t.taxType] = Number(t.amount);
    }

    const rows = properties.map(p => ({
      propertyId: p.id,
      doorplate: p.name || [p.buildingName, p.unitNo].filter(Boolean).join(' ') || p.address || `#${p.id}`,
      landTax: taxMap[p.id]?.[LAND_TAX] ?? '',
      houseTax: taxMap[p.id]?.[HOUSE_TAX] ?? ''
    }));

    return NextResponse.json({ year: y, rows });
  } catch (error) {
    console.error('GET /api/rentals/taxes/by-year error:', error);
    return handleApiError(error);
  }
}

/**
 * POST { year, rows: [{ propertyId, landTax?, houseTax? }] }
 * Upsert 地價稅/房屋稅 for each property for the year.
 */
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { year, rows } = body;
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    if (Number.isNaN(y) || !Array.isArray(rows)) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', 'year 與 rows 為必填', 400);
    }

    const dueDate = `${y}-11-30`;

    await prisma.$transaction(async (tx) => {
      let paySeq = 0;
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const prefix = `TC-${dateStr}-`;
      const existingOrders = await tx.paymentOrder.findMany({
        where: { orderNo: { startsWith: prefix } },
        select: { orderNo: true }
      });
      let maxSeq = 0;
      for (const o of existingOrders) {
        const seq = parseInt(o.orderNo.substring(prefix.length)) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
      paySeq = maxSeq;

      for (const row of rows) {
        const propertyId = parseInt(row.propertyId, 10);
        if (Number.isNaN(propertyId)) continue;
        const landVal = row.landTax != null && row.landTax !== '' ? parseFloat(row.landTax) : null;
        const houseVal = row.houseTax != null && row.houseTax !== '' ? parseFloat(row.houseTax) : null;

        for (const [taxType, amount] of [[LAND_TAX, landVal], [HOUSE_TAX, houseVal]]) {
          if (amount == null || Number.isNaN(amount)) continue;
          const existing = await tx.propertyTax.findFirst({
            where: { propertyId, taxYear: y, taxType: taxType }
          });
          if (existing) {
            await tx.propertyTax.update({
              where: { id: existing.id },
              data: { amount }
            });
          } else {
            const property = await tx.rentalProperty.findUnique({
              where: { id: propertyId },
              select: { name: true }
            });
            const tax = await tx.propertyTax.create({
              data: {
                propertyId,
                taxYear: y,
                taxType: taxType,
                dueDate,
                amount,
                status: 'pending'
              }
            });
            paySeq++;
            const orderNo = `${prefix}${String(paySeq).padStart(4, '0')}`;
            const summary = `房屋稅款 - ${property?.name || '物業'} - ${y} ${taxType}`;
            const order = await tx.paymentOrder.create({
              data: {
                orderNo,
                invoiceIds: [],
                supplierName: summary,
                paymentMethod: '轉帳',
                amount,
                discount: 0,
                netAmount: amount,
                dueDate,
                summary,
                status: '待出納'
              }
            });
            await tx.propertyTax.update({
              where: { id: tax.id },
              data: { paymentOrderId: order.id }
            });
          }
        }
      }
    });

    return NextResponse.json({ success: true, year: y });
  } catch (error) {
    console.error('POST /api/rentals/taxes/by-year error:', error);
    return handleApiError(error);
  }
}

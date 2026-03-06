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
    const body = await request.json();
    const { propertyId, maintenanceDate, category, amount } = body;

    if (!propertyId || !maintenanceDate || !category || !amount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }

    const record = await prisma.rentalMaintenance.create({
      data: {
        propertyId: parseInt(propertyId),
        maintenanceDate,
        category,
        amount: parseFloat(amount),
        supplierId: body.supplierId ? parseInt(body.supplierId) : null,
        status: 'pending',
        note: body.note || null
      },
      include: {
        property: { select: { id: true, name: true, buildingName: true } }
      }
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('POST /api/rentals/maintenance error:', error);
    return handleApiError(error);
  }
}

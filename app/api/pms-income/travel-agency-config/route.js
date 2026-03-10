import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;
  try {
    const list = await prisma.travelAgencyCommissionConfig.findMany({
      orderBy: [{ dataSource: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    return NextResponse.json(list.map(r => ({
      ...r,
      commissionPercentage: Number(r.commissionPercentage),
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const companyName = body.companyName != null ? String(body.companyName).trim() : '';
    if (!companyName) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫公司名稱', 400);
    const paymentType = body.paymentType === 'AR' || body.paymentType === 'AP' ? body.paymentType : 'NONE';
    const dataSource = body.dataSource === 'MANUAL' ? 'MANUAL' : 'AUTO';
    const commissionPercentage = Math.max(0, Math.min(100, parseFloat(body.commissionPercentage) || 0));
    const maxSort = await prisma.travelAgencyCommissionConfig.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
    const created = await prisma.travelAgencyCommissionConfig.create({
      data: {
        companyName,
        agencyCode: body.agencyCode != null ? String(body.agencyCode).trim() || null : null,
        commissionPercentage,
        paymentType,
        dataSource,
        paymentDueDay: body.paymentDueDay != null ? parseInt(body.paymentDueDay, 10) || null : null,
        paymentMethod: body.paymentMethod != null ? String(body.paymentMethod).trim() || null : null,
        isActive: body.isActive !== false,
        sortOrder,
      },
    });
    return NextResponse.json({
      ...created,
      commissionPercentage: Number(created.commissionPercentage),
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

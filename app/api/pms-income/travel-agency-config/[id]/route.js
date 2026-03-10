import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;
  try {
    const id = parseInt(params.id);
    const row = await prisma.travelAgencyCommissionConfig.findUnique({ where: { id } });
    if (!row) return createErrorResponse('NOT_FOUND', '找不到此配置', 404);
    return NextResponse.json({
      ...row,
      commissionPercentage: Number(row.commissionPercentage),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;
  try {
    const id = parseInt(params.id);
    const existing = await prisma.travelAgencyCommissionConfig.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到此配置', 404);
    const body = await request.json();
    const companyName = body.companyName != null ? String(body.companyName).trim() : existing.companyName;
    if (!companyName) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫公司名稱', 400);
    const paymentType = body.paymentType === 'AR' || body.paymentType === 'AP' ? body.paymentType : (body.paymentType === 'NONE' ? 'NONE' : existing.paymentType);
    const dataSource = body.dataSource === 'MANUAL' ? 'MANUAL' : (body.dataSource === 'AUTO' ? 'AUTO' : existing.dataSource);
    const commissionPercentage = body.commissionPercentage != null ? Math.max(0, Math.min(100, parseFloat(body.commissionPercentage) || 0)) : Number(existing.commissionPercentage);
    const updated = await prisma.travelAgencyCommissionConfig.update({
      where: { id },
      data: {
        companyName,
        agencyCode: body.agencyCode !== undefined ? (body.agencyCode != null ? String(body.agencyCode).trim() || null : null) : undefined,
        commissionPercentage,
        paymentType,
        dataSource,
        paymentDueDay: body.paymentDueDay !== undefined ? (body.paymentDueDay != null ? parseInt(body.paymentDueDay, 10) || null : null) : undefined,
        paymentMethod: body.paymentMethod !== undefined ? (body.paymentMethod != null ? String(body.paymentMethod).trim() || null : null) : undefined,
        isActive: body.isActive !== undefined ? !!body.isActive : undefined,
        sortOrder: body.sortOrder !== undefined ? parseInt(body.sortOrder, 10) : undefined,
      },
    });
    return NextResponse.json({
      ...updated,
      commissionPercentage: Number(updated.commissionPercentage),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;
  try {
    const id = parseInt(params.id);
    await prisma.travelAgencyCommissionConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

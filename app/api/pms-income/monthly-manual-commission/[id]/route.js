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
    const row = await prisma.monthlyManualCommissionEntry.findUnique({ where: { id } });
    if (!row) return createErrorResponse('NOT_FOUND', '找不到此筆記錄', 404);
    return NextResponse.json({
      ...row,
      totalRoomRent: Number(row.totalRoomRent),
      commissionPercentage: Number(row.commissionPercentage),
      commissionAmount: Number(row.commissionAmount),
      netAmount: Number(row.netAmount),
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
    const existing = await prisma.monthlyManualCommissionEntry.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到此筆記錄', 404);
    const body = await request.json();
    const totalRoomRent = body.totalRoomRent != null ? parseFloat(body.totalRoomRent) : Number(existing.totalRoomRent);
    const roomNights = body.roomNights != null ? parseInt(body.roomNights, 10) : existing.roomNights;
    const commissionPercentage = body.commissionPercentage != null ? Math.max(0, Math.min(100, parseFloat(body.commissionPercentage))) : Number(existing.commissionPercentage);
    const commissionAmount = body.commissionAmount != null ? parseFloat(body.commissionAmount) : Number(existing.commissionAmount);
    const computedCommission = Math.round(totalRoomRent * (commissionPercentage / 100) * 100) / 100;
    const finalCommission = commissionAmount >= 0 ? commissionAmount : computedCommission;
    const arOrAp = body.arOrAp === 'AR' || body.arOrAp === 'AP' ? body.arOrAp : existing.arOrAp;
    const netAmount = arOrAp === 'AP' ? totalRoomRent - finalCommission : (arOrAp === 'AR' ? totalRoomRent - finalCommission : totalRoomRent);
    const updated = await prisma.monthlyManualCommissionEntry.update({
      where: { id },
      data: {
        agencyName: body.agencyName !== undefined ? String(body.agencyName).trim() : undefined,
        agencyCode: body.agencyCode !== undefined ? (body.agencyCode ? String(body.agencyCode).trim() : null) : undefined,
        totalRoomRent,
        roomNights,
        commissionPercentage,
        commissionAmount: finalCommission,
        arOrAp,
        netAmount,
        remarks: body.remarks !== undefined ? (body.remarks ? String(body.remarks).trim() : null) : undefined,
        status: body.status !== undefined ? body.status : undefined,
      },
    });
    return NextResponse.json({
      ...updated,
      totalRoomRent: Number(updated.totalRoomRent),
      commissionPercentage: Number(updated.commissionPercentage),
      commissionAmount: Number(updated.commissionAmount),
      netAmount: Number(updated.netAmount),
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
    await prisma.monthlyManualCommissionEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

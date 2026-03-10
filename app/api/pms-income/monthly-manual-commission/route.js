import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // 202603
    if (!month) return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供 month 參數（格式 202603）', 400);
    const list = await prisma.monthlyManualCommissionEntry.findMany({
      where: { settlementMonth: month },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(list.map(r => ({
      ...r,
      totalRoomRent: Number(r.totalRoomRent),
      commissionPercentage: Number(r.commissionPercentage),
      commissionAmount: Number(r.commissionAmount),
      netAmount: Number(r.netAmount),
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
    const settlementMonth = body.settlementMonth != null ? String(body.settlementMonth).trim() : '';
    if (!/^\d{6}$/.test(settlementMonth)) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫結算月份（格式 202603）', 400);
    const agencyName = body.agencyName != null ? String(body.agencyName).trim() : '';
    if (!agencyName) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫代訂中心名稱', 400);
    const totalRoomRent = parseFloat(body.totalRoomRent);
    if (isNaN(totalRoomRent) || totalRoomRent < 0) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫有效的房租總額', 400);
    const roomNights = parseInt(body.roomNights, 10) || 0;
    const commissionPercentage = Math.max(0, Math.min(100, parseFloat(body.commissionPercentage) || 0));
    const commissionAmount = parseFloat(body.commissionAmount);
    const computedCommission = Math.round(totalRoomRent * (commissionPercentage / 100) * 100) / 100;
    const finalCommission = !isNaN(commissionAmount) && commissionAmount >= 0 ? commissionAmount : computedCommission;
    const arOrAp = body.arOrAp === 'AR' || body.arOrAp === 'AP' ? body.arOrAp : 'NONE';
    const netAmount = arOrAp === 'AP' ? totalRoomRent - finalCommission : (arOrAp === 'AR' ? totalRoomRent - finalCommission : totalRoomRent);
    const created = await prisma.monthlyManualCommissionEntry.create({
      data: {
        settlementMonth,
        agencyName,
        agencyCode: body.agencyCode != null ? String(body.agencyCode).trim() || null : null,
        totalRoomRent,
        roomNights,
        commissionPercentage,
        commissionAmount: finalCommission,
        arOrAp,
        netAmount,
        remarks: body.remarks != null ? String(body.remarks).trim() || null : null,
        status: 'DRAFT',
      },
    });
    return NextResponse.json({
      ...created,
      totalRoomRent: Number(created.totalRoomRent),
      commissionPercentage: Number(created.commissionPercentage),
      commissionAmount: Number(created.commissionAmount),
      netAmount: Number(created.netAmount),
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

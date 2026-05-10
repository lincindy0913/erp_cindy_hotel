import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { warehouse, month } = await request.json();
    if (!warehouse || !month) {
      return createErrorResponse('VALIDATION_FAILED', 'warehouse 和 month 為必填', 400);
    }

    const travelAgencies = await prisma.travelAgencyCommissionConfig.findMany({
      where: { isActive: true },
      select: { companyName: true },
    });
    const agencyNames = new Set(travelAgencies.map(a => a.companyName.trim()));

    function classifySource(row) {
      const company = (row.companyName || '').trim();
      const discount = (row.discountName || '').trim();
      if (/NET-/i.test(discount) || /booking/i.test(company) || /booking/i.test(discount)) return 'OTA-Booking';
      if (/agoda/i.test(company) || /agoda/i.test(discount)) return 'OTA-Agoda';
      if (/expedia/i.test(company) || /expedia/i.test(discount)) return 'OTA-Expedia';
      if (/攜程/.test(company)) return '攜程網';
      if (/易遊/.test(company)) return '易遊網';
      if (/一般散客/.test(company)) return '一般散客';
      if (agencyNames.has(company)) return '代訂中心';
      if (/月租/.test(discount) || /月租/.test(company)) return '月租';
      return '電話';
    }

    const rows = await prisma.pmsReservationRecord.findMany({
      where: { warehouse, businessDate: { startsWith: month } },
      select: { id: true, companyName: true, discountName: true, sourceOverride: true },
    });

    const updates = rows.map(row => ({
      id: row.id,
      newSource: classifySource(row),
    }));

    await prisma.$transaction(
      updates.map(u => prisma.pmsReservationRecord.update({
        where: { id: u.id },
        data: { source: u.newSource },
      }))
    );

    return NextResponse.json({ updated: updates.length });
  } catch (error) {
    return handleApiError(error);
  }
}

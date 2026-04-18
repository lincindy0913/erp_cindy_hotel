/**
 * POST /api/rentals/rent-filing/seed
 * body: { year: 2025 } — 為所有物業建立該年度 slot 0 草稿（已存在則略過）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const year = parseInt(body.year, 10);
    if (!year || year < 1990 || year > 2100) {
      return createErrorResponse('INVALID_YEAR', '請指定有效年份', 400);
    }

    const properties = await prisma.rentalProperty.findMany({ select: { id: true, publicInterestLandlord: true, publicInterestRent: true } });

    let created = 0;
    let skipped = 0;

    for (const p of properties) {
      const exists = await prisma.rentalAnnualRentFiling.findUnique({
        where: {
          propertyId_filingYear_slotIndex: {
            propertyId: p.id,
            filingYear: year,
            slotIndex: 0,
          },
        },
      });
      if (exists) {
        skipped++;
        continue;
      }

      const monthly =
        p.publicInterestRent != null ? Number(p.publicInterestRent) : null;
      await prisma.rentalAnnualRentFiling.create({
        data: {
          propertyId: p.id,
          filingYear: year,
          slotIndex: 0,
          isPublicInterest: p.publicInterestLandlord === true,
          declaredMonthlyRent: monthly,
          monthsInScope: monthly != null ? 12 : null,
          declaredAnnualIncome: monthly != null ? monthly * 12 : null,
          status: 'draft',
        },
      });
      created++;
    }

    return NextResponse.json({ year, created, skipped });
  } catch (error) {
    return handleApiError(error);
  }
}

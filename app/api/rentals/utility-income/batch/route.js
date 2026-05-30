/**
 * POST /api/rentals/utility-income/batch
 * body: { entries: [{ propertyId, incomeYear, incomeMonth, expectedAmount }] }
 * 一次請求批次 upsert 應收水電費，取代前端 for-await 串行
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
    const { entries } = await request.json();
    if (!Array.isArray(entries) || entries.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 entries', 400);
    }

    let saved = 0;
    for (const e of entries) {
      const { propertyId, incomeYear, incomeMonth, expectedAmount } = e;
      if (!propertyId || !incomeYear || !incomeMonth) continue;
      await prisma.rentalUtilityIncome.upsert({
        where: {
          propertyId_incomeYear_incomeMonth: {
            propertyId: parseInt(propertyId),
            incomeYear:  parseInt(incomeYear),
            incomeMonth: parseInt(incomeMonth),
          },
        },
        create: {
          propertyId:     parseInt(propertyId),
          incomeYear:     parseInt(incomeYear),
          incomeMonth:    parseInt(incomeMonth),
          expectedAmount: parseFloat(expectedAmount) || 0,
          status: 'pending',
        },
        update: {
          expectedAmount: parseFloat(expectedAmount) || 0,
        },
      });
      saved++;
    }

    return NextResponse.json({ saved });
  } catch (error) {
    return handleApiError(error);
  }
}

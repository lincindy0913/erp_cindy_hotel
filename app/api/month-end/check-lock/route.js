import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.MONTHEND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year'));
    const month = parseInt(searchParams.get('month'));
    const warehouse = searchParams.get('warehouse') || null;

    if (!year || !month || month < 1 || month > 12) {
      return createErrorResponse('VALIDATION_FAILED', '請提供有效的年份和月份', 400);
    }

    const where = { year, month };
    if (warehouse) {
      where.warehouse = warehouse;
    }

    // Check MonthEndStatus for the given period
    const monthEndStatus = await prisma.monthEndStatus.findFirst({
      where: {
        ...where,
        status: { in: ['已結帳', '已鎖定'] }
      }
    });

    if (monthEndStatus) {
      // 已鎖定：完全禁止修改
      // 已結帳：月結完成但尚未鎖定，允許繼續修改交易
      return NextResponse.json({
        locked: monthEndStatus.status === '已鎖定',
        status: monthEndStatus.status
      });
    }

    return NextResponse.json({
      locked: false,
      status: null
    });
  } catch (error) {
    return handleApiError(error);
  }
}

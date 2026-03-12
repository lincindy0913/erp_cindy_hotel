import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 依館別、日期區間查詢每日信用卡手續費
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PMS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse') ?? '';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const where = {};
    if (warehouse !== '') where.warehouse = warehouse;
    if (startDate && endDate) {
      where.settlementDate = { gte: startDate, lte: endDate };
    } else if (startDate) where.settlementDate = { gte: startDate };
    else if (endDate) where.settlementDate = { lte: endDate };

    const entries = await prisma.pmsCreditCardFeeEntry.findMany({
      where,
      orderBy: [{ settlementDate: 'desc' }, { warehouse: 'asc' }]
    });

    const result = entries.map(e => ({
      ...e,
      feeAmount: Number(e.feeAmount),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 新增或更新單日信用卡手續費 (upsert by warehouse + settlementDate)
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.PMS_IMPORT);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    if (!data.warehouse || !data.settlementDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '館別與入帳日為必填', 400);
    }

    const feeAmount = parseFloat(data.feeAmount);
    if (Number.isNaN(feeAmount) || feeAmount < 0) {
      return createErrorResponse('VALIDATION_FAILED', '手續費金額須為非負數字', 400);
    }

    const result = await prisma.pmsCreditCardFeeEntry.upsert({
      where: {
        warehouse_settlementDate: {
          warehouse: String(data.warehouse).trim(),
          settlementDate: String(data.settlementDate).trim()
        }
      },
      update: { feeAmount, note: data.note?.trim() || null },
      create: {
        warehouse: String(data.warehouse).trim(),
        settlementDate: String(data.settlementDate).trim(),
        feeAmount,
        note: data.note?.trim() || null
      }
    });

    return NextResponse.json({
      ...result,
      feeAmount: Number(result.feeAmount),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

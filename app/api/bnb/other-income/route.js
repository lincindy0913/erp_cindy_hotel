import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month     = searchParams.get('month');
    const monthFrom = searchParams.get('monthFrom');
    const monthTo   = searchParams.get('monthTo');
    const warehouse = searchParams.get('warehouse');

    const where = {};
    if (month) where.importMonth = month;
    if (monthFrom || monthTo) {
      where.importMonth = {};
      if (monthFrom) where.importMonth.gte = monthFrom;
      if (monthTo)   where.importMonth.lte = monthTo;
    }
    if (warehouse) where.warehouse = warehouse;

    const records = await prisma.bnbOtherIncome.findMany({
      where,
      orderBy: [{ incomeDate: 'desc' }, { id: 'desc' }],
    });

    const data = records.map(r => ({ ...r, amount: Number(r.amount) }));
    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_CREATE, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { importMonth, warehouse, incomeDate, category, description, amount, note } = body;

    if (!importMonth || !warehouse || !incomeDate || !description || amount == null) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }

    const operator = auth.session?.user?.name || auth.session?.user?.email || null;
    const record = await prisma.bnbOtherIncome.create({
      data: {
        importMonth, warehouse, incomeDate,
        category: category || null,
        description,
        amount: parseFloat(amount) || 0,
        note: note || null,
        createdBy: operator,
      },
    });

    return NextResponse.json({ ...record, amount: Number(record.amount) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { validateWarehouse } from '@/lib/master-data-validator';
import { applyWarehouseFilter } from '@/lib/warehouse-access';
import { localDateStr } from '@/lib/localDate';
import { nextSequence } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';

// GET: 查詢員工代墊款清單
export async function GET(request) {
  try {
    const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const employeeName = searchParams.get('employeeName');

    const where = {};
    if (status) where.status = status;
    if (employeeName) where.employeeName = employeeName;

    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    const records = await prisma.employeeAdvance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(records);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 手動新增代墊款紀錄
export async function POST(request) {
  try {
    const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
    if (!auth.ok) return auth.response;
    const session = auth.session;
    const body = await request.json();
    const { employeeName, paymentMethod, amount, sourceDescription, expenseName, summary, warehouse, note } = body;

    if (!employeeName || !amount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫代墊員工和金額', 400);
    }
    const whErr = await validateWarehouse(warehouse);
    if (whErr) return createErrorResponse('VALIDATION_FAILED', whErr, 400);

    const dateStr = localDateStr(new Date()).replace(/-/g, '');

    const record = await prisma.$transaction(async (tx) => {
      const advanceNo = await nextSequence(tx, 'employeeAdvance', 'advanceNo', `ADV-${dateStr}-`);
      return tx.employeeAdvance.create({
        data: {
          advanceNo,
          employeeName,
          paymentMethod: paymentMethod || '現金',
          sourceType: 'other',
          sourceDescription: sourceDescription || null,
          expenseName: expenseName || null,
          summary: summary || null,
          amount: parseFloat(amount),
          status: '待結算',
          warehouse: warehouse || null,
          note: note || null,
          createdBy: session?.user?.email || null,
        },
      });
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

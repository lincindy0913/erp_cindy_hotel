import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';
import { validateWarehouse, validateSupplier } from '@/lib/master-data-validator';
import { assertPeriodOpen } from '@/lib/period-lock';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo   = searchParams.get('dateTo');

    const defaultFrom = (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().split('T')[0];
    })();

    const where = {
      invoiceDate: {
        gte: dateFrom || defaultFrom,
        ...(dateTo ? { lte: dateTo } : {}),
      },
    };

    // Warehouse-level access control
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { id: 'asc' },
      take: 2000,
    });

    const result = expenses.map(e => ({
      ...e,
      amount: Number(e.amount),
      actualPaymentAmount: Number(e.actualPaymentAmount),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.invoiceId || !data.invoiceNo || !data.amount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位：發票ID、發票號碼和金額', 400);
    }

    // Validate against master data
    const whErr = await validateWarehouse(data.warehouse);
    if (whErr) return createErrorResponse('VALIDATION_FAILED', whErr, 400);
    const supErr = await validateSupplier(data.supplierName);
    if (supErr) return createErrorResponse('VALIDATION_FAILED', supErr, 400);

    const newExpense = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, data.invoiceDate, data.warehouse);

      return tx.expense.create({
        data: {
          invoiceId: parseInt(data.invoiceId),
          invoiceNo: data.invoiceNo,
          invoiceDate: data.invoiceDate || '',
          amount: parseFloat(data.amount),
          actualPaymentDate: '',
          actualPaymentAmount: 0,
          status: '未完成',
          supplierId: data.supplierId ? parseInt(data.supplierId) : null,
          supplierName: data.supplierName || '',
          warehouse: data.warehouse || ''
        }
      });
    });

    return NextResponse.json({
      ...newExpense,
      amount: Number(newExpense.amount),
      actualPaymentAmount: Number(newExpense.actualPaymentAmount),
      createdAt: newExpense.createdAt.toISOString(),
      updatedAt: newExpense.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

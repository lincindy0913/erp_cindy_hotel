import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { nextSequence } from '@/lib/sequence-generator';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/employee-advances/import-excel
 * body: { rows: [{ date, employeeName, amount, description, paymentMethod }] }
 *
 * 批次建立員工代墊記錄（EmployeeAdvance）。
 */
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { rows } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '無有效資料', 400);
    }

    const errors  = [];
    let   created = 0;
    const today   = todayStr();

    await prisma.$transaction(async tx => {
      for (const r of rows) {
        const rowNum       = r._row ?? '?';
        const date         = r.date?.trim() || today;
        const employeeName = r.employeeName?.trim();
        const amount       = parseFloat(r.amount);
        const description  = r.description?.trim() || '';
        const paymentMethod = r.paymentMethod?.trim() || '現金';

        if (!employeeName) { errors.push({ row: rowNum, message: '員工姓名為必填' }); continue; }
        if (isNaN(amount) || amount <= 0) { errors.push({ row: rowNum, message: '金額需大於 0' }); continue; }

        const dateStr   = date.replace(/-/g, '');
        const advanceNo = await nextSequence(tx, 'employeeAdvance', 'advanceNo', `ADV-${dateStr}-`);

        await tx.employeeAdvance.create({
          data: {
            advanceNo,
            employeeName,
            paymentMethod,
            sourceType:        'other',
            sourceDescription: description,
            expenseName:       description,
            amount,
            status: '待結算',
          },
        });
        created++;
      }
    });

    return NextResponse.json({ count: created, errors });
  } catch (error) {
    return handleApiError(error);
  }
}

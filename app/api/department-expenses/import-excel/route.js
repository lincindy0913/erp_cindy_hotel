import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * POST /api/department-expenses/import-excel
 * body: { rows: [{ year, month, department, category, amount, tax }] }
 *
 * 批次建立部門費用記錄（DepartmentExpense）。
 * 同月份 + 部門 + 類別若已存在則更新（upsert）。
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

    for (const r of rows) {
      const rowNum    = r._row ?? '?';
      const year      = parseInt(r.year);
      const month     = parseInt(r.month);
      const dept      = r.department?.trim();
      const category  = r.category?.trim();
      const amount    = parseFloat(r.amount);
      const tax       = parseFloat(r.tax || '0') || 0;

      if (!year || !month || month < 1 || month > 12) { errors.push({ row: rowNum, message: '年份和月份需為有效數字（月份 1-12）' }); continue; }
      if (!dept)     { errors.push({ row: rowNum, message: '部門為必填' }); continue; }
      if (!category) { errors.push({ row: rowNum, message: '費用類別為必填' }); continue; }
      if (isNaN(amount) || amount < 0) { errors.push({ row: rowNum, message: '金額需為有效數字' }); continue; }

      await prisma.departmentExpense.upsert({
        where:  { year_month_department_category: { year, month, department: dept, category } },
        create: { year, month, department: dept, category, tax, totalAmount: amount },
        update: { tax, totalAmount: amount },
      }).catch(async () => {
        // fallback：若無 unique index 則直接 create
        await prisma.departmentExpense.create({
          data: { year, month, department: dept, category, tax, totalAmount: amount },
        });
      });
      created++;
    }

    return NextResponse.json({ count: created, errors });
  } catch (error) {
    return handleApiError(error);
  }
}

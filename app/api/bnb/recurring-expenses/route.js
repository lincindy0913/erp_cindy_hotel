/**
 * GET  /api/bnb/recurring-expenses?warehouse=xxx  — 列出模板
 * POST /api/bnb/recurring-expenses                 — 建立模板
 * POST /api/bnb/recurring-expenses?action=draft&month=YYYY-MM&warehouse=xxx — 建立本月草稿
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const warehouse = searchParams.get('warehouse');

  try {
    const templates = await prisma.bnbRecurringExpense.findMany({
      where: { isActive: true, ...(warehouse ? { warehouse } : {}) },
      orderBy: [{ warehouse: 'asc' }, { category: 'asc' }],
    });
    return NextResponse.json(templates.map(t => ({ ...t, defaultAmt: Number(t.defaultAmt) })));
  } catch (error) { return handleApiError(error); }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_EDIT);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const body = await request.json();
    const userName = auth.session?.user?.name || auth.session?.user?.email || 'system';

    // 建立本月草稿
    if (action === 'draft') {
      const { month, warehouse } = body;
      if (!month) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 month', 400);

      const templates = await prisma.bnbRecurringExpense.findMany({
        where: { isActive: true, ...(warehouse ? { warehouse } : {}) },
      });
      if (templates.length === 0) return NextResponse.json({ created: 0, message: '無啟用中的模板' });

      // 找 BnbOtherIncome 的類別 IDs（這裡直接用 description 建立）
      let created = 0;
      for (const t of templates) {
        const incomeDate = `${month}-01`;
        // 避免重複：同月份同描述同館別已存在則跳過
        const existing = await prisma.bnbOtherIncome.findFirst({
          where: { importMonth: month, warehouse: t.warehouse, description: t.description },
        });
        if (existing) continue;
        await prisma.bnbOtherIncome.create({
          data: {
            importMonth: month,
            warehouse: t.warehouse,
            incomeDate,
            category: t.category,
            description: t.description,
            amount: t.defaultAmt,
            status: '草稿',
            note: '由月固定費用模板建立',
            createdBy: userName,
          },
        });
        created++;
      }
      return NextResponse.json({ created, total: templates.length, message: `已建立 ${created} 筆草稿（跳過 ${templates.length - created} 筆已存在）` });
    }

    // 建立模板
    const { warehouse, category, description, defaultAmt } = body;
    if (!warehouse || !category || !description || defaultAmt == null) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '館別、科目、描述、預設金額為必填', 400);
    }
    const template = await prisma.bnbRecurringExpense.create({
      data: { warehouse, category, description, defaultAmt: parseFloat(defaultAmt), createdBy: userName },
    });
    return NextResponse.json({ ...template, defaultAmt: Number(template.defaultAmt) }, { status: 201 });
  } catch (error) { return handleApiError(error); }
}

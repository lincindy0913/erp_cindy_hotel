/**
 * GET  /api/owner-expenses?month=2026-03        — 取得當月所有發票抬頭費用
 * GET  /api/owner-expenses?year=2026            — 取得全年各月彙整
 * POST /api/owner-expenses                      — 新增或更新單筆（upsert）
 *
 * 公司來源：使用 InvoiceTitle（發票抬頭）作為 master，不再維護 OwnerCompany
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.OWNER_EXPENSE_VIEW, PERMISSIONS.OWNER_EXPENSE_CREATE, PERMISSIONS.OWNER_EXPENSE_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year  = searchParams.get('year');

    if (month) {
      // 月明細：以發票抬頭為主，每個抬頭都顯示一行
      const [titles, expenses] = await Promise.all([
        prisma.invoiceTitle.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        }),
        prisma.ownerMonthlyExpense.findMany({
          where: { expenseMonth: month },
          include: { invoiceTitle: true },
          orderBy: { invoiceTitle: { sortOrder: 'asc' } },
        }),
      ]);

      // 以 invoiceTitleId 建 Map
      const expenseMap = new Map(expenses.map(e => [e.invoiceTitleId, e]));

      // 合併：每個抬頭都要顯示（無記錄則為空）
      // 保留 companyId / companyName 欄位名稱供前端相容
      const rows = titles.map(t => ({
        companyId:    t.id,
        companyName:  t.title,
        taxId:        t.taxId,
        expenseId:    expenseMap.get(t.id)?.id    ?? null,
        totalAmount:  expenseMap.get(t.id) ? Number(expenseMap.get(t.id).totalAmount) : 0,
        invoiceCount: expenseMap.get(t.id)?.invoiceCount ?? 0,
        status:       expenseMap.get(t.id)?.status ?? null,
        note:         expenseMap.get(t.id)?.note   ?? '',
        confirmedAt:  expenseMap.get(t.id)?.confirmedAt ?? null,
        confirmedBy:  expenseMap.get(t.id)?.confirmedBy ?? null,
      }));

      const monthTotal     = rows.reduce((s, r) => s + r.totalAmount, 0);
      const confirmedCount = rows.filter(r => r.status === '已確認').length;

      return NextResponse.json({ month, rows, monthTotal, confirmedCount });
    }

    if (year) {
      // 年度彙整：各月 × 各發票抬頭
      const [titles, expenses] = await Promise.all([
        prisma.invoiceTitle.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        }),
        prisma.ownerMonthlyExpense.findMany({
          where: { expenseMonth: { startsWith: year } },
          orderBy: { expenseMonth: 'asc' },
        }),
      ]);

      // 建立 month → invoiceTitleId → amount 的巢狀 Map
      const byMonth = new Map();
      for (const e of expenses) {
        if (!byMonth.has(e.expenseMonth)) byMonth.set(e.expenseMonth, {});
        byMonth.get(e.expenseMonth)[e.invoiceTitleId] = Number(e.totalAmount);
      }

      const months   = [...byMonth.keys()].sort();
      const yearRows = months.map(m => {
        const row = { month: m, total: 0, byCompany: {} };
        for (const t of titles) {
          const amt = byMonth.get(m)?.[t.id] ?? 0;
          row.byCompany[t.id] = amt;
          row.total += amt;
        }
        return row;
      });

      const yearTotal = yearRows.reduce((s, r) => s + r.total, 0);

      // 回傳 companies 欄位供前端相容（實際資料來自 InvoiceTitle）
      return NextResponse.json({
        year,
        companies: titles.map(t => ({ id: t.id, companyName: t.title, taxId: t.taxId })),
        yearRows,
        yearTotal,
      });
    }

    return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供 month 或 year 參數', 400);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.OWNER_EXPENSE_CREATE, PERMISSIONS.OWNER_EXPENSE_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    // 前端傳入 companyId（相容舊欄位名稱），實際對應 invoiceTitleId
    const { expenseMonth, companyId, totalAmount, invoiceCount, status, note } = body;

    if (!expenseMonth || !companyId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 expenseMonth 或 companyId', 400);
    }

    const invoiceTitleId = parseInt(companyId);
    const data = {
      totalAmount:  totalAmount  != null ? parseFloat(totalAmount)  : 0,
      invoiceCount: invoiceCount != null ? parseInt(invoiceCount)   : 1,
      status:       status || '待確認',
      note:         note   || null,
    };

    const expense = await prisma.ownerMonthlyExpense.upsert({
      where: { expenseMonth_invoiceTitleId: { expenseMonth, invoiceTitleId } },
      create: { expenseMonth, invoiceTitleId, ...data },
      update: data,
    });

    return NextResponse.json({ ...expense, totalAmount: Number(expense.totalAmount) });
  } catch (error) {
    return handleApiError(error);
  }
}

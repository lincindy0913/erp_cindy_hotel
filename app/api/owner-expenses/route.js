/**
 * GET  /api/owner-expenses?month=2026-03        — 取得當月所有公司費用
 * GET  /api/owner-expenses?year=2026            — 取得全年各月彙整
 * POST /api/owner-expenses                      — 新增或更新單筆（upsert）
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
      // 月明細：取得當月所有公司費用 + 所有啟用公司（確保每間都顯示）
      const [companies, expenses] = await Promise.all([
        prisma.ownerCompany.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { companyName: 'asc' }],
        }),
        prisma.ownerMonthlyExpense.findMany({
          where: { expenseMonth: month },
          include: { company: true },
          orderBy: { company: { sortOrder: 'asc' } },
        }),
      ]);

      // 以 companyId 建 Map
      const expenseMap = new Map(expenses.map(e => [e.companyId, e]));

      // 合併：每間公司都要顯示（無記錄則為空）
      const rows = companies.map(c => ({
        companyId:    c.id,
        companyName:  c.companyName,
        taxId:        c.taxId,
        expenseId:    expenseMap.get(c.id)?.id    ?? null,
        totalAmount:  expenseMap.get(c.id) ? Number(expenseMap.get(c.id).totalAmount) : 0,
        invoiceCount: expenseMap.get(c.id)?.invoiceCount ?? 0,
        status:       expenseMap.get(c.id)?.status ?? null,
        note:         expenseMap.get(c.id)?.note   ?? '',
        confirmedAt:  expenseMap.get(c.id)?.confirmedAt ?? null,
        confirmedBy:  expenseMap.get(c.id)?.confirmedBy ?? null,
      }));

      const monthTotal = rows.reduce((s, r) => s + r.totalAmount, 0);
      const confirmedCount = rows.filter(r => r.status === '已確認').length;

      return NextResponse.json({ month, rows, monthTotal, confirmedCount });
    }

    if (year) {
      // 年度彙整：各月 × 各公司
      const [companies, expenses] = await Promise.all([
        prisma.ownerCompany.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { companyName: 'asc' }],
        }),
        prisma.ownerMonthlyExpense.findMany({
          where: { expenseMonth: { startsWith: year } },
          include: { company: true },
          orderBy: { expenseMonth: 'asc' },
        }),
      ]);

      // 建立 month → companyId → amount 的巢狀 Map
      const byMonth = new Map();
      for (const e of expenses) {
        if (!byMonth.has(e.expenseMonth)) byMonth.set(e.expenseMonth, {});
        byMonth.get(e.expenseMonth)[e.companyId] = Number(e.totalAmount);
      }

      // 產生 01-12 月列（有資料才顯示）
      const months = [...byMonth.keys()].sort();
      const yearRows = months.map(m => {
        const row = { month: m, total: 0, byCompany: {} };
        for (const c of companies) {
          const amt = byMonth.get(m)?.[c.id] ?? 0;
          row.byCompany[c.id] = amt;
          row.total += amt;
        }
        return row;
      });

      const yearTotal = yearRows.reduce((s, r) => s + r.total, 0);

      return NextResponse.json({ year, companies, yearRows, yearTotal });
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
    const { expenseMonth, companyId, totalAmount, invoiceCount, status, note } = body;

    if (!expenseMonth || !companyId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 expenseMonth 或 companyId', 400);
    }

    const data = {
      totalAmount:  totalAmount  != null ? parseFloat(totalAmount)  : 0,
      invoiceCount: invoiceCount != null ? parseInt(invoiceCount)   : 1,
      status:       status || '待確認',
      note:         note   || null,
    };

    const expense = await prisma.ownerMonthlyExpense.upsert({
      where: { expenseMonth_companyId: { expenseMonth, companyId: parseInt(companyId) } },
      create: { expenseMonth, companyId: parseInt(companyId), ...data },
      update: data,
      include: { company: true },
    });

    return NextResponse.json({ ...expense, totalAmount: Number(expense.totalAmount) });
  } catch (error) {
    return handleApiError(error);
  }
}

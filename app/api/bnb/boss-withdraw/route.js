/**
 * GET /api/bnb/boss-withdraw?month=YYYY-MM&warehouse=民宿
 * GET /api/bnb/boss-withdraw?year=2026&warehouse=民宿  → 年度月份彙整報表
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month     = searchParams.get('month');
    const year      = searchParams.get('year');
    const warehouse = searchParams.get('warehouse');
    const summary   = searchParams.get('summary') === 'true';

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (month) {
      where.withdrawDate = { startsWith: month };
    } else if (year) {
      where.withdrawDate = { startsWith: year };
    }

    const rows = await prisma.bnbBossWithdraw.findMany({
      where,
      orderBy: [{ withdrawDate: 'asc' }, { id: 'asc' }],
    });

    const mapped = rows.map(r => ({ ...r, amount: Number(r.amount) }));

    // 月份彙整模式：依 YYYY-MM 和 warehouse 分組
    if (summary) {
      const monthMap = {};
      for (const r of mapped) {
        const m = r.withdrawDate?.slice(0, 7) || 'unknown';
        const w = r.warehouse || '未知';
        const key = `${m}||${w}`;
        if (!monthMap[key]) monthMap[key] = { month: m, warehouse: w, cnt: 0, total: 0 };
        monthMap[key].cnt++;
        monthMap[key].total += r.amount;
      }
      const summaryRows = Object.values(monthMap).sort((a, b) =>
        b.month.localeCompare(a.month) || (a.warehouse || '').localeCompare(b.warehouse || '')
      );
      return NextResponse.json({
        summaryRows,
        grandTotal: mapped.reduce((s, r) => s + r.amount, 0),
        grandCnt: mapped.length,
      });
    }

    return NextResponse.json({
      rows: mapped,
      total: mapped.reduce((s, r) => s + r.amount, 0),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

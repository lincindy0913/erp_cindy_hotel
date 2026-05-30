/**
 * GET   /api/bnb/boss-withdraw?month=YYYY-MM&warehouse=民宿
 * GET   /api/bnb/boss-withdraw?year=2026&warehouse=民宿  → 年度月份彙整報表
 * PATCH /api/bnb/boss-withdraw        → { id, confirm: true/false } 確認/取消確認領取
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

    // 未確認筆數（加在每次查詢回應）
    const unconfirmedCount = mapped.filter(r => !r.confirmedAt).length;

    return NextResponse.json({
      rows: mapped,
      total: mapped.reduce((s, r) => s + r.amount, 0),
      unconfirmedCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id, confirm } = await request.json();
    if (!id) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 id', 400);

    const record = await prisma.bnbBossWithdraw.findUnique({ where: { id: parseInt(id) } });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到記錄', 404);

    const userName = auth.session?.user?.name || auth.session?.user?.email || 'unknown';
    const updated = await prisma.bnbBossWithdraw.update({
      where: { id: parseInt(id) },
      data: confirm
        ? { confirmedAt: new Date(), confirmedBy: userName }
        : { confirmedAt: null, confirmedBy: null },
    });

    return NextResponse.json({ ...updated, amount: Number(updated.amount) });
  } catch (error) {
    return handleApiError(error);
  }
}

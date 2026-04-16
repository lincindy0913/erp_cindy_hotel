/**
 * GET /api/bnb/boss-withdraw?month=YYYY-MM&warehouse=民宿
 *   → 回傳老闆收取現金記錄列表
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
    const warehouse = searchParams.get('warehouse');

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (month) {
      // withdrawDate 是 YYYY-MM-DD 字串，用 startsWith 篩月份
      where.withdrawDate = { startsWith: month };
    }

    const rows = await prisma.bnbBossWithdraw.findMany({
      where,
      orderBy: [{ withdrawDate: 'desc' }, { id: 'desc' }],
    });

    return NextResponse.json({
      rows: rows.map(r => ({ ...r, amount: Number(r.amount) })),
      total: rows.reduce((s, r) => s + Number(r.amount), 0),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET  /api/bnb/ota-reconcile-log — 查詢歷次比對記錄
 * POST /api/bnb/ota-reconcile-log — 明確確認並儲存比對結果
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_VIEW, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const source    = searchParams.get('source')    || undefined;
    const warehouse = searchParams.get('warehouse') || undefined;
    const year      = searchParams.get('year')      || undefined;

    const where = {};
    if (source)    where.otaSource       = source;
    if (warehouse) where.warehouse       = warehouse;
    if (year)      where.reconcileMonth  = { startsWith: year };

    const rows = await prisma.bnbOtaReconcileLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        otaTotal:      Number(r.otaTotal),
        bnbTotal:      Number(r.bnbTotal),
        diff:          Number(r.diff),
        otaCommission: Number(r.otaCommission),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── POST：明確確認並存檔比對結果 ─────────────────────────────────────
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT, PERMISSIONS.BNB_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      reconcileMonth, otaSource, warehouse,
      dateFrom, dateTo,
      otaRowCount, bnbRowCount, matchedCount,
      unmatchedOtaCnt, unmatchedBnbCnt, issueCount, cancelledCount,
      otaTotal, bnbTotal, diff, otaCommission,
    } = body;

    const userName = auth.session?.user?.name || auth.session?.user?.email || null;

    // upsert：同月份 + 來源 + 館別 只保留最新一筆
    const existing = await prisma.bnbOtaReconcileLog.findFirst({
      where: { reconcileMonth, otaSource, warehouse },
      orderBy: { createdAt: 'desc' },
    });

    let log;
    if (existing) {
      log = await prisma.bnbOtaReconcileLog.update({
        where: { id: existing.id },
        data: {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          otaRowCount, bnbRowCount, matchedCount,
          unmatchedOtaCnt, unmatchedBnbCnt, issueCount, cancelledCount,
          otaTotal, bnbTotal, diff, otaCommission,
          createdBy: userName,
        },
      });
    } else {
      log = await prisma.bnbOtaReconcileLog.create({
        data: {
          reconcileMonth, otaSource, warehouse,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          otaRowCount, bnbRowCount, matchedCount,
          unmatchedOtaCnt, unmatchedBnbCnt, issueCount, cancelledCount,
          otaTotal, bnbTotal, diff, otaCommission,
          createdBy: userName,
        },
      });
    }

    return NextResponse.json({ ok: true, id: log.id });
  } catch (error) {
    return handleApiError(error);
  }
}

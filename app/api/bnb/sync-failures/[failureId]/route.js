import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { syncBnbPaymentTx } from '@/lib/syncBnbPaymentTx';

export const dynamic = 'force-dynamic';

// POST /api/bnb/sync-failures/[failureId]/retry — 重試出納同步
export async function POST(_request, { params }) {
  const auth = await requirePermission(PERMISSIONS.BNB_EDIT ?? 'bnb.edit');
  if (!auth.ok) return auth.response;

  const { failureId: failureIdParam } = await params;
  const failureId = parseInt(failureIdParam, 10);
  if (Number.isNaN(failureId)) return createErrorResponse('INVALID_INPUT', 'id 無效', 400);

  try {
    const failure = await prisma.bnbSyncFailure.findUnique({
      where: { id: failureId },
      select: { id: true, bookingId: true, resolved: true },
    });
    if (!failure) return createErrorResponse('NOT_FOUND', '找不到失敗記錄', 404);
    if (failure.resolved) return NextResponse.json({ ok: true, message: '已解決，無需重試' });

    await syncBnbPaymentTx(failure.bookingId);

    await prisma.bnbSyncFailure.update({
      where: { id: failureId },
      data: { resolved: true, resolvedAt: new Date() },
    });

    return NextResponse.json({ ok: true, message: '重試成功，出納同步完成' });
  } catch (error) {
    const msg = error?.message || String(error);
    console.error('[retry sync-failure] id=%d error:', failureId, msg);
    await prisma.bnbSyncFailure.create({
      data: {
        bookingId: (await prisma.bnbSyncFailure.findUnique({ where: { id: failureId }, select: { bookingId: true } }))?.bookingId ?? 0,
        errorMsg: `重試失敗：${msg}`,
      },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: `重試失敗：${msg}` }, { status: 500 });
  }
}

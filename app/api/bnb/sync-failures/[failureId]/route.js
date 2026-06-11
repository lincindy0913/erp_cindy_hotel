import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { syncBnbPaymentTx } from '@/lib/syncBnbPaymentTx';
import { PAY_TYPE_KEYS, bookingToPaymentEntry, syncPaymentEntry } from '@/lib/bnb-pay-types';

export const dynamic = 'force-dynamic';

// POST /api/bnb/sync-failures/[failureId] — 重試同步（現金流 或 付款明細分表）
export async function POST(_request, { params }) {
  const auth = await requirePermission(PERMISSIONS.BNB_EDIT ?? 'bnb.edit');
  if (!auth.ok) return auth.response;

  const { failureId: failureIdParam } = await params;
  const failureId = parseInt(failureIdParam, 10);
  if (Number.isNaN(failureId)) return createErrorResponse('INVALID_INPUT', 'id 無效', 400);

  try {
    const failure = await prisma.bnbSyncFailure.findUnique({
      where: { id: failureId },
      select: { id: true, bookingId: true, resolved: true, errorMsg: true },
    });
    if (!failure) return createErrorResponse('NOT_FOUND', '找不到失敗記錄', 404);
    if (failure.resolved) return NextResponse.json({ ok: true, message: '已解決，無需重試' });

    const isEntrySync = failure.errorMsg?.startsWith('[ENTRY_SYNC:');

    if (isEntrySync) {
      // 重新同步 BnbPaymentEntry 分表
      const booking = await prisma.bnbBookingRecord.findUnique({ where: { id: failure.bookingId } });
      if (!booking) return createErrorResponse('NOT_FOUND', '找不到訂房記錄', 404);
      for (const payType of PAY_TYPE_KEYS) {
        const entryData = bookingToPaymentEntry(booking, payType);
        if (entryData) await syncPaymentEntry(prisma, failure.bookingId, payType, entryData);
      }
    } else {
      // 重新同步現金流 CashTransaction
      await syncBnbPaymentTx(failure.bookingId);
    }

    // 解決此筆及同一 bookingId 的同類未解決失敗
    const typeFilter = isEntrySync ? { startsWith: '[ENTRY_SYNC:' } : { not: { startsWith: '[ENTRY_SYNC:' } };
    await prisma.bnbSyncFailure.updateMany({
      where: { bookingId: failure.bookingId, resolved: false, errorMsg: typeFilter },
      data: { resolved: true, resolvedAt: new Date() },
    });

    return NextResponse.json({ ok: true, message: isEntrySync ? '重試成功，付款明細已同步' : '重試成功，出納已同步' });
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

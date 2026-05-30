/**
 * PATCH /api/bnb/batch
 *
 * action: 'savePayment'
 *   body: { action, records: [{ id, payDeposit, depositLast5, payCard, payCash, payVoucher }] }
 *   → 批次儲存付款欄位（需 BNB_CREATE 或 BNB_EDIT；鎖定列不可修改）
 *
 * action: 'lock'
 *   body: { action, ids: [1, 2, ...] }
 *   → 鎖定付款列（需 BNB_LOCK）
 *
 * action: 'unlock'
 *   body: { action, ids: [1, 2, ...] }
 *   → 解鎖付款列（需 BNB_LOCK）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertBnbMonthOpen } from '@/lib/bnb-lock';
import { PAY_TYPE_KEYS, bookingToPaymentEntry, syncPaymentEntry } from '@/lib/bnb-pay-types';

export const dynamic = 'force-dynamic';

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'savePayment') {
      const auth = await requireAnyPermission([PERMISSIONS.BNB_CREATE, PERMISSIONS.BNB_EDIT]);
      if (!auth.ok) return auth.response;

      const { records } = body;
      if (!Array.isArray(records) || records.length === 0) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 records', 400);
      }

      // 先收集所有 id，批次查詢月份/館別並檢查月鎖
      const allIds = records.map(r => parseInt(r.id)).filter(Boolean);
      const allRecs = await prisma.bnbBookingRecord.findMany({
        where: { id: { in: allIds } },
        select: { id: true, importMonth: true, warehouse: true },
      });
      const checkedPairs = new Set();
      for (const r of allRecs) {
        const key = `${r.importMonth}|${r.warehouse}`;
        if (!checkedPairs.has(key)) {
          await assertBnbMonthOpen(r.importMonth, r.warehouse);
          checkedPairs.add(key);
        }
      }

      let saved = 0;
      let skipped = 0;
      const failures = [];

      for (const rec of records) {
        const id = parseInt(rec.id);
        if (!id) continue;

        const existing = await prisma.bnbBookingRecord.findUnique({
          where: { id },
          select: { paymentLocked: true, payCard: true, cardFeeRate: true,
                    payCash: true, cashDestination: true, guestName: true,
                    warehouse: true, checkInDate: true, checkOutDate: true, bossWithdrawNote: true,
                    payDeposit: true, payTransfer: true, payVoucher: true, isComplimentary: true },
        });
        if (!existing) continue;
        if (existing.paymentLocked) { skipped++; continue; }

        const updateData = {};
        if (rec.payDeposit       !== undefined) updateData.payDeposit       = parseFloat(rec.payDeposit)  || 0;
        if (rec.depositDate      !== undefined) updateData.depositDate      = rec.depositDate   || null;
        if (rec.depositLast5     !== undefined) updateData.depositLast5     = rec.depositLast5  || null;
        if (rec.payTransfer      !== undefined) updateData.payTransfer      = parseFloat(rec.payTransfer) || 0;
        if (rec.transferDate     !== undefined) updateData.transferDate     = rec.transferDate  || null;
        if (rec.transferLast5    !== undefined) updateData.transferLast5    = rec.transferLast5 || null;
        if (rec.payCard          !== undefined) updateData.payCard          = parseFloat(rec.payCard)     || 0;
        if (rec.payCash          !== undefined) updateData.payCash          = parseFloat(rec.payCash)     || 0;
        if (rec.cashDestination  !== undefined) updateData.cashDestination  = rec.cashDestination || null;
        if (rec.payVoucher       !== undefined) updateData.payVoucher       = parseFloat(rec.payVoucher)  || 0;

        // 重新計算手續費
        if (updateData.payCard !== undefined) {
          const rate = Number(existing.cardFeeRate) || 0;
          updateData.cardFee = updateData.payCard * rate;
        }

        if (rec.isComplimentary !== undefined) updateData.isComplimentary = rec.isComplimentary === true;

        const dep  = updateData.payDeposit  ?? Number(existing.payDeposit);
        const trn  = updateData.payTransfer ?? Number(existing.payTransfer);
        const crd  = updateData.payCard     ?? Number(existing.payCard);
        const csh  = updateData.payCash     ?? Number(existing.payCash);
        const vch  = updateData.payVoucher  ?? Number(existing.payVoucher);
        const comp = updateData.isComplimentary ?? existing.isComplimentary;
        updateData.paymentFilled = comp || (dep + trn + crd + csh + vch) > 0;

        try {
          await prisma.bnbBookingRecord.update({ where: { id }, data: updateData });

          // B16 雙寫：同步 BnbPaymentEntry
          const refreshed = { ...existing, ...updateData };
          for (const payType of PAY_TYPE_KEYS) {
            const entryData = bookingToPaymentEntry(refreshed, payType);
            if (entryData) await syncPaymentEntry(prisma, id, payType, entryData).catch(() => {});
          }

          // 同步 BnbBossWithdraw
          const finalCash = updateData.payCash          ?? Number(existing.payCash);
          const finalDest = updateData.cashDestination  ?? existing.cashDestination;
          if (finalDest === '老闆收取' && finalCash > 0) {
            const exists = await prisma.bnbBossWithdraw.findFirst({ where: { bookingId: id } });
            if (!exists) {
              await prisma.bnbBossWithdraw.create({
                data: {
                  warehouse:    existing.warehouse,
                  withdrawDate: existing.checkOutDate || existing.checkInDate,
                  amount:       finalCash,
                  bookingId:    id,
                  guestName:    existing.guestName,
                  note:         existing.bossWithdrawNote || null,
                },
              });
            } else if (Number(exists.amount) !== finalCash) {
              await prisma.bnbBossWithdraw.update({ where: { id: exists.id }, data: { amount: finalCash } });
            }
          } else if (finalDest !== '老闆收取') {
            // 如果取消老闆收取，刪除對應記錄
            await prisma.bnbBossWithdraw.deleteMany({ where: { bookingId: id } });
          }

          saved++;
        } catch (err) {
          failures.push({ id, error: err.message || '儲存失敗' });
        }
      }

      return NextResponse.json({ ok: true, saved, skipped, failures });
    }

    if (action === 'lock' || action === 'unlock') {
      const auth = await requireAnyPermission([PERMISSIONS.BNB_LOCK, PERMISSIONS.BNB_EDIT]);
      if (!auth.ok) return auth.response;

      const { ids } = body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 ids', 400);
      }

      // 檢查月份鎖
      const lockRecs = await prisma.bnbBookingRecord.findMany({
        where: { id: { in: ids.map(Number) } },
        select: { importMonth: true, warehouse: true },
      });
      const lockChecked = new Set();
      for (const r of lockRecs) {
        const key = `${r.importMonth}|${r.warehouse}`;
        if (!lockChecked.has(key)) {
          await assertBnbMonthOpen(r.importMonth, r.warehouse);
          lockChecked.add(key);
        }
      }

      const userName = auth.session?.user?.name || auth.session?.user?.email || 'system';
      const isLocking = action === 'lock';

      await prisma.bnbBookingRecord.updateMany({
        where: { id: { in: ids.map(Number) } },
        data: {
          paymentLocked:   isLocking,
          paymentLockedAt: isLocking ? new Date() : null,
          paymentLockedBy: isLocking ? userName    : null,
        },
      });

      return NextResponse.json({ ok: true, count: ids.length, locked: isLocking });
    }

    return createErrorResponse('INVALID_PARAMETER', `未知 action: ${action}`, 400);
  } catch (error) {
    return handleApiError(error);
  }
}

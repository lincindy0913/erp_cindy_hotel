'use client';

import { useMemo } from 'react';
import { todayStr } from '@/lib/localDate';

export function useBnbPageStats(records) {
  const _today = todayStr();

  const recStats = useMemo(() => records.reduce((acc, r) => {
    if (r.status === '已刪除') return acc;
    acc.rooms++;
    acc.revenue  += Number(r.roomCharge) + Number(r.otherCharge);
    acc.deposit  += Number(r.payDeposit);
    acc.transfer += Number(r.payTransfer);
    acc.card     += Number(r.payCard);
    acc.cash     += Number(r.payCash);
    acc.voucher  += Number(r.payVoucher);
    acc.cardFee  += Number(r.cardFee);
    acc.unfilled      += (!r.paymentFilled && !r.isComplimentary) ? 1 : 0;
    acc.complimentary += r.isComplimentary ? 1 : 0;
    acc.locked        += r.paymentLocked ? 1 : 0;
    if (r.status === '已退房' && !r.paymentFilled && !r.isComplimentary && r.checkOutDate && r.checkOutDate < _today) acc.overdueUnpaid++;
    if (Number(r.payCard) > 0 && !r.cardSettlementDate) acc.cardDateMissing++;
    const pt = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
    const ct = Number(r.roomCharge) + Number(r.otherCharge);
    if (r.paymentFilled && !r.isComplimentary && Math.abs(pt - ct) > 0.01) acc.mismatch++;
    return acc;
  }, { rooms: 0, revenue: 0, deposit: 0, transfer: 0, card: 0, cash: 0, voucher: 0, cardFee: 0, unfilled: 0, complimentary: 0, locked: 0, mismatch: 0, overdueUnpaid: 0, cardDateMissing: 0 }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [records]);

  const roomStats = useMemo(() => {
    const map = {};
    for (const r of records) {
      if (r.status === '已刪除') continue;
      const key = r.roomNo || '未指定';
      if (!map[key]) map[key] = { roomNo: key, bookings: 0, revenue: 0, nights: 0 };
      map[key].bookings++;
      map[key].revenue += Number(r.roomCharge) + Number(r.otherCharge);
      map[key].nights  += Math.max(0, Math.round((new Date(r.checkOutDate) - new Date(r.checkInDate)) / 86400000));
    }
    return Object.values(map).sort((a, b) => b.bookings - a.bookings);
  }, [records]);

  return { recStats, roomStats };
}

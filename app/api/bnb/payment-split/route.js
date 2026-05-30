/**
 * GET /api/bnb/payment-split?year=2026&warehouse=民宿
 *
 * 按月拆分「公帳收入」vs「私帳（老闆收取現金）」
 * 公帳 = payDeposit + payTransfer + payCard + payCash(存帳) + payVoucher
 * 私帳 = payCash(老闆收取)
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
    const year      = parseInt(searchParams.get('year') || new Date().getFullYear());
    const warehouse = searchParams.get('warehouse') || '';

    const yearStart = `${year}-01`;
    const yearEnd   = `${year}-12`;

    const where = {
      importMonth:   { gte: yearStart, lte: yearEnd },
      status:        { not: '已刪除' },
      paymentFilled: true,
    };
    if (warehouse) where.warehouse = warehouse;

    const bookings = await prisma.bnbBookingRecord.findMany({
      where,
      select: {
        importMonth:     true,
        payDeposit:      true,
        payTransfer:     true,
        payCard:         true,
        payCash:         true,
        payVoucher:      true,
        cashDestination: true,
      },
    });

    const months = [];
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${year}-${String(m).padStart(2, '0')}`;
      const mb = bookings.filter(b => b.importMonth === monthKey);

      let publicRevenue  = 0;
      let privateRevenue = 0;
      let voucherRevenue = 0;

      for (const b of mb) {
        publicRevenue  += Number(b.payDeposit) + Number(b.payTransfer) + Number(b.payCard);
        voucherRevenue += Number(b.payVoucher);
        if (b.cashDestination === '老闆收取') {
          privateRevenue += Number(b.payCash);
        } else {
          publicRevenue += Number(b.payCash);
        }
      }

      const total = publicRevenue + privateRevenue + voucherRevenue;
      months.push({
        month:          monthKey,
        bookings:       mb.length,
        publicRevenue:  Math.round(publicRevenue),
        privateRevenue: Math.round(privateRevenue),
        voucherRevenue: Math.round(voucherRevenue),
        total:          Math.round(total),
        privatePct:     total > 0 ? parseFloat((privateRevenue / total * 100).toFixed(1)) : 0,
      });
    }

    const totals = months.reduce((acc, m) => {
      acc.bookings       += m.bookings;
      acc.publicRevenue  += m.publicRevenue;
      acc.privateRevenue += m.privateRevenue;
      acc.voucherRevenue += m.voucherRevenue;
      acc.total          += m.total;
      return acc;
    }, { bookings: 0, publicRevenue: 0, privateRevenue: 0, voucherRevenue: 0, total: 0 });

    totals.privatePct = totals.total > 0
      ? parseFloat((totals.privateRevenue / totals.total * 100).toFixed(1))
      : 0;

    return NextResponse.json({ year, months, totals });
  } catch (error) {
    return handleApiError(error);
  }
}

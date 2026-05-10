import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const OTA_SOURCES  = ['OTA-Booking', 'OTA-Agoda', 'OTA-Expedia', '攜程網', '易遊網'];
const BOOK_SOURCES = ['代訂中心'];

/**
 * GET /api/pms-income/cashier-summary
 * 出納月結應收/應付彙總
 *
 * Query: warehouse, yearMonth (YYYY-MM)
 *
 * Returns:
 *  ar  — OTA 應收款（旅館向 OTA 收款）+ 代訂中心應收
 *  ap  — 廠商行程應付 + OTA 佣金應付
 *  depositOutstanding — 累計預收款餘額
 */
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse  = searchParams.get('warehouse') || '';
    const yearMonth  = searchParams.get('yearMonth') || '';

    if (!yearMonth) {
      return NextResponse.json({ error: { message: 'yearMonth 為必填（YYYY-MM）' } }, { status: 400 });
    }

    const where = { businessDate: { startsWith: yearMonth } };
    if (warehouse) where.warehouse = warehouse;

    // ── 1. 訂房記錄（OTA + 代訂中心）──
    const reservations = await prisma.pmsReservationRecord.findMany({
      where: {
        ...where,
        source: { in: [...OTA_SOURCES, ...BOOK_SOURCES] },
      },
      select: {
        source: true, sourceOverride: true,
        totalRevenue: true, commission: true,
        cash: true, creditCard: true, wireTransfer: true,
      },
    });

    // 應收款彙總（OTA 撥款應收 + 代訂中心應收）
    const arMap = {};
    for (const r of reservations) {
      const src = r.sourceOverride || r.source;
      if (!arMap[src]) arMap[src] = { source: src, type: '', count: 0, totalRevenue: 0, commission: 0, netReceivable: 0, cash: 0, creditCard: 0, wireTransfer: 0 };
      const g = arMap[src];
      g.count++;
      g.totalRevenue  += Number(r.totalRevenue);
      g.commission    += Number(r.commission);
      g.cash          += Number(r.cash);
      g.creditCard    += Number(r.creditCard);
      g.wireTransfer  += Number(r.wireTransfer);
      g.type = OTA_SOURCES.includes(src) ? 'OTA應收' : '代訂應收';
      // OTA 淨應收 = totalRevenue - commission（佣金由 OTA 扣除後撥款）
      g.netReceivable = g.totalRevenue - g.commission;
    }
    const ar = Object.values(arMap).sort((a, b) => b.netReceivable - a.netReceivable);

    // ── 2. 廠商行程應付帳（AP）──
    const apWhere = { billingMonth: yearMonth, direction: 'AP' };
    if (warehouse) apWhere.warehouse = warehouse;

    const vendorBillings = await prisma.vendorItineraryBilling.findMany({
      where: apWhere,
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const ap = vendorBillings.map(b => ({
      id:            b.id,
      supplierName:  b.supplier?.name || b.supplierName,
      supplierId:    b.supplierId,
      status:        b.status,
      totalAmount:   Number(b.totalAmount),
      settledAmount: Number(b.settledAmount),
      outstanding:   Number(b.totalAmount) - Number(b.settledAmount),
      dueDate:       b.dueDate || null,
      notes:         b.notes || null,
    }));

    // ── 3. 廠商應收（AR billing — 旅館向廠商收款）──
    const arBillingWhere = { billingMonth: yearMonth, direction: 'AR' };
    if (warehouse) arBillingWhere.warehouse = warehouse;

    const arBillings = await prisma.vendorItineraryBilling.findMany({
      where: arBillingWhere,
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const arVendor = arBillings.map(b => ({
      id:            b.id,
      supplierName:  b.supplier?.name || b.supplierName,
      status:        b.status,
      totalAmount:   Number(b.totalAmount),
      settledAmount: Number(b.settledAmount),
      outstanding:   Number(b.totalAmount) - Number(b.settledAmount),
      dueDate:       b.dueDate || null,
    }));

    // ── 4. 訂金餘額（全期累計）──
    const depositRows = await prisma.pmsReservationRecord.aggregate({
      where: warehouse ? { warehouse } : {},
      _sum: { depositIn: true, depositOut: true },
    });
    const depositIn  = Number(depositRows._sum.depositIn  || 0);
    const depositOut = Number(depositRows._sum.depositOut || 0);
    const depositOutstanding = depositIn - depositOut;

    // ── 5. 彙總數字 ──
    const totalAR     = ar.reduce((s, r) => s + r.netReceivable, 0);
    const totalAP     = ap.reduce((s, r) => s + r.outstanding, 0);
    const totalArVend = arVendor.reduce((s, r) => s + r.outstanding, 0);

    return NextResponse.json({
      warehouse, yearMonth,
      ar,        // OTA + 代訂中心應收
      ap,        // 廠商行程應付
      arVendor,  // 廠商應收
      depositOutstanding,
      summary: {
        totalAR,
        totalAP,
        totalArVendor: totalArVend,
        netPosition: totalAR + totalArVend - totalAP,
        depositOutstanding,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

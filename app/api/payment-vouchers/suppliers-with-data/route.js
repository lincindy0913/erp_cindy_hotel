import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payment-vouchers/suppliers-with-data?month=2026-03&warehouse=
 * Also supports: ?startDate=2026-03-01&endDate=2026-03-31&warehouse=
 * Returns suppliers that have purchase data for the given period
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse') || '';

    let dateGte, dateLt;
    if (startDate && endDate) {
      dateGte = startDate;
      // endDate is inclusive, so add one day for lt comparison
      const ed = new Date(endDate);
      ed.setDate(ed.getDate() + 1);
      dateLt = ed.toISOString().slice(0, 10);
    } else if (month) {
      dateGte = `${month}-01`;
      const [year, mon] = month.split('-');
      dateLt = parseInt(mon) === 12
        ? `${parseInt(year) + 1}-01-01`
        : `${year}-${String(parseInt(mon) + 1).padStart(2, '0')}-01`;
    } else {
      return NextResponse.json([]);
    }

    const whereClause = {
      purchaseDate: { gte: dateGte, lt: dateLt },
    };
    if (warehouse) whereClause.warehouse = warehouse;

    // Get distinct supplier IDs with purchases in this month
    const purchases = await prisma.purchaseMaster.findMany({
      where: whereClause,
      select: {
        supplierId: true,
        supplier: { select: { id: true, name: true } },
      },
      distinct: ['supplierId'],
    });

    // Aggregate count per supplier
    const supplierMap = new Map();
    for (const p of purchases) {
      if (!p.supplierId || !p.supplier) continue;
      if (!supplierMap.has(p.supplierId)) {
        supplierMap.set(p.supplierId, { id: p.supplier.id, name: p.supplier.name, count: 0 });
      }
    }

    // Get actual counts
    const supplierIds = [...supplierMap.keys()];
    if (supplierIds.length > 0) {
      const counts = await prisma.purchaseMaster.groupBy({
        by: ['supplierId'],
        where: { ...whereClause, supplierId: { in: supplierIds } },
        _count: { id: true },
      });
      for (const c of counts) {
        const s = supplierMap.get(c.supplierId);
        if (s) s.count = c._count.id;
      }
    }

    const result = Array.from(supplierMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

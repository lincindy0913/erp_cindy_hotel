import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payment-vouchers/preview
 * spec23 v3: 傳票預覽資料 (JSON)
 * 回傳 printConfig (orientation, dateColumns, makerName) + 品項比價附記資訊
 */
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const supplierId = parseInt(searchParams.get('supplierId'));
    const month = searchParams.get('month');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse') || '';

    if (!supplierId || isNaN(supplierId) || (!month && (!startDate || !endDate))) {
      return createErrorResponse('VALIDATION_FAILED', '缺少必要參數', 400);
    }

    const makerName = auth.session?.user?.name || auth.session?.user?.email?.split('@')[0] || '未知使用者';

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { name: true, phone: true, paymentTerms: true }
    });
    if (!supplier) return createErrorResponse('NOT_FOUND', '廠商不存在', 404);

    let monthStart, nextMonth;
    if (startDate && endDate) {
      monthStart = startDate;
      const ed = new Date(endDate);
      ed.setDate(ed.getDate() + 1);
      nextMonth = ed.toISOString().slice(0, 10);
    } else {
      monthStart = `${month}-01`;
      const [year, mon] = month.split('-');
      nextMonth = parseInt(mon) === 12
        ? `${parseInt(year) + 1}-01-01`
        : `${year}-${String(parseInt(mon) + 1).padStart(2, '0')}-01`;
    }

    const whereClause = {
      supplierId,
      purchaseDate: { gte: monthStart, lt: nextMonth },
    };
    if (warehouse) whereClause.warehouse = warehouse;

    const purchases = await prisma.purchaseMaster.findMany({
      where: whereClause,
      include: {
        details: { include: { product: { select: { id: true, name: true } } } }
      },
      orderBy: { purchaseDate: 'asc' }
    });

    const dateSet = new Set(purchases.map(p => p.purchaseDate));
    const dateColumns = dateSet.size;
    const orientation = dateColumns >= 15 ? 'landscape' : 'portrait';

    // Build items with price notes
    const productPrices = new Map();
    for (const purchase of purchases) {
      for (const detail of purchase.details) {
        const pid = detail.productId;
        if (!productPrices.has(pid)) {
          productPrices.set(pid, {
            productId: pid,
            productName: detail.product?.name || '-',
            currentUnitPrice: Number(detail.unitPrice),
          });
        }
      }
    }

    const items = [];
    for (const [pid, info] of productPrices) {
      const recentHistory = await prisma.priceHistory.findMany({
        where: {
          productId: pid,
          supplierId,
          isSuperseded: false,
          purchaseDate: { lt: monthStart }
        },
        orderBy: { purchaseDate: 'desc' },
        take: 3
      });

      let isPriceNote = false;
      let priceComparison = null;

      if (recentHistory.length > 0) {
        const recentMin = Math.min(...recentHistory.map(h => Number(h.unitPrice)));
        if (info.currentUnitPrice > recentMin) {
          isPriceNote = true;
          const cheapest = recentHistory.find(h => Number(h.unitPrice) === recentMin);
          const diff = info.currentUnitPrice - recentMin;
          priceComparison = {
            recentRecords: recentHistory.map(h => ({ unitPrice: Number(h.unitPrice), purchaseDate: h.purchaseDate })),
            recentMin,
            cheapestDate: cheapest?.purchaseDate || '',
            priceDiff: `+${diff.toFixed(0)}`,
            diffRate: `+${((diff / recentMin) * 100).toFixed(1)}%`,
            historyCount: recentHistory.length,
            includesCrossWarehouse: false
          };
        }
      }

      items.push({ ...info, isPriceNote, priceComparison });
    }

    const noteItems = items.filter(i => i.isPriceNote);

    return NextResponse.json({
      supplier: { id: supplierId, name: supplier.name, phone: supplier.phone, paymentTerms: supplier.paymentTerms },
      month,
      warehouse,
      printConfig: {
        dateColumns,
        orientation,
        makerName
      },
      items,
      priceNoteSummary: {
        totalItems: items.length,
        noteCount: noteItems.length,
        noteItems: noteItems.map(i => i.productName)
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

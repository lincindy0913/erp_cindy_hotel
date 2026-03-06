import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products/:id/price-cache
 *
 * Fast price comparison data from PriceSummaryCache (spec0 v3).
 * Target response time: < 50ms (index scan on cache table).
 *
 * Query params:
 *   ?warehouse=X     - Filter by warehouse
 *   ?supplierId=Y    - Filter by supplier ID
 *
 * Fallback: if no cache exists, queries PriceHistory directly and builds cache on-the-fly.
 */
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const productId = parseInt(params.id);
    if (isNaN(productId)) {
      return createErrorResponse('VALIDATION_FAILED', '無效的產品 ID', 400);
    }

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true },
    });
    if (!product) {
      return createErrorResponse('NOT_FOUND', '產品不存在', 404);
    }

    // Parse optional query params
    const { searchParams } = new URL(request.url);
    const warehouseFilter = searchParams.get('warehouse') || null;
    const supplierIdFilter = searchParams.get('supplierId')
      ? parseInt(searchParams.get('supplierId'))
      : null;

    // Build where clause for PriceSummaryCache
    const cacheWhere = { productId };
    if (warehouseFilter) cacheWhere.warehouse = warehouseFilter;
    if (supplierIdFilter) cacheWhere.supplierId = supplierIdFilter;

    // --- Primary path: read from PriceSummaryCache ---
    let cacheRecords = await prisma.priceSummaryCache.findMany({
      where: cacheWhere,
      include: {
        supplier: { select: { id: true, name: true } },
      },
      orderBy: [{ warehouse: 'asc' }, { supplierId: 'asc' }],
    });

    let isFallback = false;

    // --- Fallback path: if no cache, build from PriceHistory ---
    if (cacheRecords.length === 0) {
      cacheRecords = await buildCacheFromHistory(productId, warehouseFilter, supplierIdFilter);
      isFallback = cacheRecords.length > 0;
    }

    // If truly no data at all (first-time product, no purchase history)
    if (cacheRecords.length === 0) {
      return NextResponse.json({
        productId,
        productName: product.name,
        bySupplier: [],
        globalLowest: null,
        byWarehouse: [],
        recentHistory: [],
        cacheStatus: {
          hasAvgPrice: false,
          lastUpdated: null,
          isFallback: false,
        },
      });
    }

    // --- Format response ---
    const hasAvgPrice = cacheRecords.some((r) => r.avgPrice3m !== null);
    const lastUpdated = cacheRecords.reduce((latest, r) => {
      return r.lastUpdated > latest ? r.lastUpdated : latest;
    }, cacheRecords[0].lastUpdated);

    // Find global lowest across all records
    let globalLowest = null;
    for (const rec of cacheRecords) {
      if (rec.lowestPrice !== null) {
        const price = Number(rec.lowestPrice);
        if (!globalLowest || price < globalLowest.price) {
          globalLowest = {
            price,
            supplierId: rec.supplierId,
            supplierName: rec.supplier?.name || '未知廠商',
            warehouse: rec.warehouse,
            date: rec.lowestDate || null,
          };
        }
      }
    }

    // bySupplier: one entry per supplier+warehouse combo
    const bySupplier = cacheRecords.map((rec) => {
      const latestPrice = rec.latestPrice !== null ? Number(rec.latestPrice) : null;
      const lowestPrice = rec.lowestPrice !== null ? Number(rec.lowestPrice) : null;

      let diffFromLowest = null;
      if (latestPrice !== null && lowestPrice !== null && lowestPrice > 0) {
        const diff = ((latestPrice - lowestPrice) / lowestPrice) * 100;
        diffFromLowest = diff === 0 ? '0%' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
      }

      return {
        supplierId: rec.supplierId,
        supplierName: rec.supplier?.name || '未知廠商',
        warehouse: rec.warehouse,
        latestPrice,
        latestDate: rec.latestDate || null,
        lowestPrice,
        lowestDate: rec.lowestDate || null,
        avgPrice3m: rec.avgPrice3m !== null ? Number(rec.avgPrice3m) : null,
        avgPrice12m: rec.avgPrice12m !== null ? Number(rec.avgPrice12m) : null,
        purchaseCount12m: rec.purchaseCount12m ?? null,
        diffFromLowest,
      };
    });

    // byWarehouse: best (latest) per warehouse (pick the record with most recent latestDate)
    const warehouseMap = new Map();
    for (const rec of cacheRecords) {
      const wh = rec.warehouse;
      const existing = warehouseMap.get(wh);
      if (
        !existing ||
        (rec.latestDate && (!existing.latestDate || rec.latestDate > existing.latestDate))
      ) {
        warehouseMap.set(wh, rec);
      }
    }
    const byWarehouse = Array.from(warehouseMap.values()).map((rec) => ({
      warehouse: rec.warehouse,
      supplierId: rec.supplierId,
      supplierName: rec.supplier?.name || '未知廠商',
      latestPrice: rec.latestPrice !== null ? Number(rec.latestPrice) : null,
      latestDate: rec.latestDate || null,
    }));

    // Fetch recent 5 PriceHistory records for context
    const historyWhere = {
      productId,
      isSuperseded: false,
    };
    if (warehouseFilter) historyWhere.warehouse = warehouseFilter;
    if (supplierIdFilter) historyWhere.supplierId = supplierIdFilter;

    const recentHistory = await prisma.priceHistory.findMany({
      where: historyWhere,
      include: {
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { purchaseDate: 'desc' },
      take: 5,
    });

    const formattedHistory = recentHistory.map((h) => ({
      id: h.id,
      supplierId: h.supplierId,
      supplierName: h.supplier?.name || '未知廠商',
      warehouse: h.warehouse,
      purchaseDate: h.purchaseDate,
      unitPrice: Number(h.unitPrice),
      quantity: h.quantity,
    }));

    return NextResponse.json({
      productId,
      productName: product.name,
      bySupplier,
      globalLowest,
      byWarehouse,
      recentHistory: formattedHistory,
      cacheStatus: {
        hasAvgPrice,
        lastUpdated: lastUpdated?.toISOString() || null,
        isFallback,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Fallback: build PriceSummaryCache from PriceHistory when cache is empty.
 * Groups PriceHistory by (supplierId, warehouse) for this product,
 * calculates summary, upserts cache, and returns the created records.
 */
async function buildCacheFromHistory(productId, warehouseFilter, supplierIdFilter) {
  const historyWhere = {
    productId,
    isSuperseded: false,
  };
  if (warehouseFilter) historyWhere.warehouse = warehouseFilter;
  if (supplierIdFilter) historyWhere.supplierId = supplierIdFilter;

  const histories = await prisma.priceHistory.findMany({
    where: historyWhere,
    orderBy: { purchaseDate: 'desc' },
  });

  if (histories.length === 0) return [];

  // Group by supplierId + warehouse
  const groups = new Map();
  for (const h of histories) {
    const key = `${h.supplierId}::${h.warehouse || ''}`;
    if (!groups.has(key)) {
      groups.set(key, {
        supplierId: h.supplierId,
        warehouse: h.warehouse || '',
        records: [],
      });
    }
    groups.get(key).records.push(h);
  }

  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const threeMonthStr = formatDateStr(threeMonthsAgo);
  const twelveMonthStr = formatDateStr(twelveMonthsAgo);

  const upsertedRecords = [];

  for (const [, group] of groups) {
    const { supplierId, warehouse, records } = group;

    // Sort descending by purchaseDate (already sorted but ensure)
    records.sort((a, b) => (b.purchaseDate > a.purchaseDate ? 1 : -1));

    const latest = records[0];
    const latestPrice = Number(latest.unitPrice);
    const latestDate = latest.purchaseDate;

    // Find lowest
    let lowestPrice = latestPrice;
    let lowestDate = latestDate;
    for (const r of records) {
      const p = Number(r.unitPrice);
      if (p < lowestPrice) {
        lowestPrice = p;
        lowestDate = r.purchaseDate;
      }
    }

    // Avg 3m
    const recent3m = records.filter((r) => r.purchaseDate >= threeMonthStr);
    const avgPrice3m =
      recent3m.length > 0
        ? recent3m.reduce((sum, r) => sum + Number(r.unitPrice), 0) / recent3m.length
        : null;

    // Avg 12m
    const recent12m = records.filter((r) => r.purchaseDate >= twelveMonthStr);
    const avgPrice12m =
      recent12m.length > 0
        ? recent12m.reduce((sum, r) => sum + Number(r.unitPrice), 0) / recent12m.length
        : null;

    const purchaseCount12m = recent12m.length;

    // Upsert into PriceSummaryCache
    const upserted = await prisma.priceSummaryCache.upsert({
      where: {
        productId_supplierId_warehouse: {
          productId,
          supplierId,
          warehouse,
        },
      },
      update: {
        latestPrice,
        latestDate,
        lowestPrice,
        lowestDate,
        avgPrice3m: avgPrice3m !== null ? Math.round(avgPrice3m * 100) / 100 : null,
        avgPrice12m: avgPrice12m !== null ? Math.round(avgPrice12m * 100) / 100 : null,
        purchaseCount12m,
        lastUpdated: now,
      },
      create: {
        productId,
        supplierId,
        warehouse,
        latestPrice,
        latestDate,
        lowestPrice,
        lowestDate,
        avgPrice3m: avgPrice3m !== null ? Math.round(avgPrice3m * 100) / 100 : null,
        avgPrice12m: avgPrice12m !== null ? Math.round(avgPrice12m * 100) / 100 : null,
        purchaseCount12m,
        lastUpdated: now,
      },
      include: {
        supplier: { select: { id: true, name: true } },
      },
    });

    upsertedRecords.push(upserted);
  }

  return upsertedRecords;
}

/**
 * Format Date to YYYY/MM/DD string for comparison with purchaseDate field.
 */
function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

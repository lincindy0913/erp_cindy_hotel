import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * POST /api/price-cache/rebuild
 *
 * Triggers a full rebuild of PriceSummaryCache from PriceHistory (admin only).
 * Iterates all non-superseded PriceHistory records, groups by (productId, supplierId, warehouse),
 * calculates latestPrice, lowestPrice, avgPrice3m, avgPrice12m, purchaseCount12m,
 * and upserts each group into PriceSummaryCache.
 *
 * This is intended for:
 *   - Initial cache population after migration
 *   - Monthly full recalculation (spec13 STEP 6-6)
 *   - Admin manual trigger from system settings (spec20)
 *
 * Body (optional):
 *   { "productId": 123 }  - Rebuild only for a specific product
 */
export async function POST(request) {
  try {
    // Parse optional body
    let body = {};
    try {
      body = await request.json();
    } catch {
      // No body provided, rebuild all
    }

    const specificProductId = body.productId ? parseInt(body.productId) : null;

    const startTime = Date.now();

    // Fetch all non-superseded PriceHistory records
    const historyWhere = { isSuperseded: false };
    if (specificProductId) {
      historyWhere.productId = specificProductId;
    }

    const histories = await prisma.priceHistory.findMany({
      where: historyWhere,
      orderBy: { purchaseDate: 'desc' },
      select: {
        productId: true,
        supplierId: true,
        warehouse: true,
        purchaseDate: true,
        unitPrice: true,
      },
    });

    if (histories.length === 0) {
      return NextResponse.json({
        success: true,
        message: specificProductId
          ? `產品 ID ${specificProductId} 無採購歷史記錄，無需重建快取`
          : '無採購歷史記錄，無需重建快取',
        stats: {
          historyRecords: 0,
          groupsProcessed: 0,
          cacheUpserted: 0,
          durationMs: Date.now() - startTime,
        },
      });
    }

    // Group by productId + supplierId + warehouse
    const groups = new Map();
    for (const h of histories) {
      const key = `${h.productId}::${h.supplierId}::${h.warehouse || ''}`;
      if (!groups.has(key)) {
        groups.set(key, {
          productId: h.productId,
          supplierId: h.supplierId,
          warehouse: h.warehouse || '',
          records: [],
        });
      }
      groups.get(key).records.push(h);
    }

    // Calculate date thresholds for averages
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    const threeMonthStr = formatDateStr(threeMonthsAgo);
    const twelveMonthStr = formatDateStr(twelveMonthsAgo);

    // Process in batches to avoid overwhelming the database
    const BATCH_SIZE = 100;
    const groupEntries = Array.from(groups.values());
    let upsertCount = 0;
    let errorCount = 0;

    for (let i = 0; i < groupEntries.length; i += BATCH_SIZE) {
      const batch = groupEntries.slice(i, i + BATCH_SIZE);

      const upsertPromises = batch.map((group) => {
        const { productId, supplierId, warehouse, records } = group;

        // Records are already sorted desc by purchaseDate from query
        const latest = records[0];
        const latestPrice = Number(latest.unitPrice);
        const latestDate = latest.purchaseDate;

        // Find lowest price
        let lowestPrice = Infinity;
        let lowestDate = latestDate;
        for (const r of records) {
          const p = Number(r.unitPrice);
          if (p < lowestPrice) {
            lowestPrice = p;
            lowestDate = r.purchaseDate;
          }
        }

        // Calculate 3-month average
        const recent3m = records.filter((r) => r.purchaseDate >= threeMonthStr);
        const avgPrice3m =
          recent3m.length > 0
            ? recent3m.reduce((sum, r) => sum + Number(r.unitPrice), 0) / recent3m.length
            : null;

        // Calculate 12-month average
        const recent12m = records.filter((r) => r.purchaseDate >= twelveMonthStr);
        const avgPrice12m =
          recent12m.length > 0
            ? recent12m.reduce((sum, r) => sum + Number(r.unitPrice), 0) / recent12m.length
            : null;

        const purchaseCount12m = recent12m.length;

        return prisma.priceSummaryCache
          .upsert({
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
          })
          .then(() => {
            upsertCount++;
          })
          .catch((err) => {
            console.error(
              `PriceSummaryCache upsert failed for product=${productId} supplier=${supplierId} warehouse=${warehouse}:`,
              err.message
            );
            errorCount++;
          });
      });

      await Promise.all(upsertPromises);
    }

    const durationMs = Date.now() - startTime;

    // Clean up stale cache entries that no longer have corresponding PriceHistory
    let staleRemoved = 0;
    if (!specificProductId) {
      // Find cache entries where the product+supplier+warehouse combo no longer exists in PriceHistory
      try {
        const staleResult = await prisma.$executeRaw`
          DELETE FROM price_summary_caches
          WHERE id IN (
            SELECT psc.id FROM price_summary_caches psc
            LEFT JOIN price_history ph
              ON psc.product_id = ph.product_id
              AND psc.supplier_id = ph.supplier_id
              AND psc.warehouse = ph.warehouse
              AND ph.is_superseded = false
            WHERE ph.id IS NULL
          )
        `;
        staleRemoved = staleResult;
      } catch {
        // Stale cleanup is best-effort, don't fail the whole rebuild
        console.warn('Stale cache cleanup skipped (non-critical)');
      }
    }

    return NextResponse.json({
      success: true,
      message: specificProductId
        ? `產品 ID ${specificProductId} 的比價快取已重建`
        : '全部比價快取已重建',
      stats: {
        historyRecords: histories.length,
        groupsProcessed: groupEntries.length,
        cacheUpserted: upsertCount,
        errors: errorCount,
        staleRemoved,
        durationMs,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
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

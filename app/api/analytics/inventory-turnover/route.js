import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { calcAllQtysForWarehouse, DEFAULT_LOW_STOCK_THRESHOLD } from '@/lib/inventory-helpers';

export const dynamic = 'force-dynamic';

// GET /api/analytics/inventory-turnover
//   ?days=90        分析區間（預設 90 天，最多 365）
//   ?warehouse=     選填，不給則全倉合計
//
// 指標：
//   turnoverRate    = 區間領用量 / 平均庫存量（越高越好）
//   daysOfInventory = 以目前消耗速度還能撐幾天
//   classification  = active / slow / dead
//     active: 區間內有領用，週轉天數 ≤ 90
//     slow:   區間內有領用，週轉天數 > 90
//     dead:   區間內完全沒有領用（= 呆料）
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const days      = Math.min(parseInt(searchParams.get('days') || '90'), 365);
    const warehouse = searchParams.get('warehouse') || null;

    const today     = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // 1. 在庫產品（含閾值與成本）
    const products = await prisma.product.findMany({
      where: { isInStock: true },
      select: { id: true, name: true, code: true, unit: true, costPrice: true, lowStockThreshold: true },
    });
    if (products.length === 0) return NextResponse.json({ products: [], summary: {} });

    const productMap = new Map(products.map(p => [p.id, p]));

    // 2. 區間領用量（groupBy productId）
    const reqWhere = { requisitionDate: { gte: startDate, lte: today } };
    if (warehouse) reqWhere.warehouse = warehouse;

    const reqGroups = await prisma.inventoryRequisition.groupBy({
      by: ['productId'],
      where: reqWhere,
      _sum: { quantity: true },
    }).catch(() => []);
    const consumedMap = new Map(reqGroups.map(g => [g.productId, g._sum.quantity || 0]));

    // 3. 最近一次領用日
    const lastReqGroups = await prisma.inventoryRequisition.groupBy({
      by: ['productId'],
      where: warehouse ? { warehouse } : {},
      _max: { requisitionDate: true },
    }).catch(() => []);
    const lastReqMap = new Map(lastReqGroups.map(g => [g.productId, g._max.requisitionDate]));

    // 4. 目前庫存量
    const currentQtyMap = await calcAllQtysForWarehouse(prisma, warehouse);

    // 5. 組合指標
    const now = new Date();
    const result = products.map(p => {
      const currentQty  = Math.max(currentQtyMap.get(p.id) || 0, 0);
      const consumedQty = consumedMap.get(p.id)  || 0;
      const lastReqDate = lastReqMap.get(p.id)   || null;
      const costPrice   = Number(p.costPrice || 0);

      // 日均消耗量
      const dailyAvg = consumedQty / days;

      // 週轉天數：目前存量除以日均消耗，0 消耗則 Infinity
      const daysOfInventory = dailyAvg > 0 ? Math.round(currentQty / dailyAvg) : null;

      // 週轉率（年化）：(消耗 / 平均庫存) × (365 / days)
      // 區間沒有期初資料，以當下庫存近似平均庫存
      const avgQty = currentQty > 0 ? currentQty : consumedQty / 2;
      const turnoverRate = avgQty > 0 && consumedQty > 0
        ? Math.round((consumedQty / avgQty) * (365 / days) * 10) / 10
        : 0;

      // 分類
      let classification;
      if (consumedQty === 0) {
        classification = 'dead';
      } else if (daysOfInventory !== null && daysOfInventory > 90) {
        classification = 'slow';
      } else {
        classification = 'active';
      }

      return {
        productId:       p.id,
        code:            p.code,
        name:            p.name,
        unit:            p.unit,
        currentQty,
        consumedQty,
        dailyAvg:        Math.round(dailyAvg * 100) / 100,
        daysOfInventory,
        turnoverRate,
        inventoryValue:  Math.round(currentQty * costPrice * 100) / 100,
        lastReqDate,
        classification,
        threshold:       p.lowStockThreshold || DEFAULT_LOW_STOCK_THRESHOLD,
      };
    }).filter(r => r.currentQty > 0 || r.consumedQty > 0); // 空品項不顯示

    // 6. 分類彙總
    const byClass = { active: [], slow: [], dead: [] };
    for (const r of result) byClass[r.classification].push(r);

    const summarize = (arr) => ({
      count:          arr.length,
      totalValue:     Math.round(arr.reduce((s, r) => s + r.inventoryValue, 0) * 100) / 100,
      avgTurnoverRate: arr.length
        ? Math.round(arr.reduce((s, r) => s + r.turnoverRate, 0) / arr.length * 10) / 10
        : 0,
    });

    return NextResponse.json({
      asOf:      today,
      days,
      warehouse,
      products:  result.sort((a, b) => {
        const order = { dead: 0, slow: 1, active: 2 };
        return order[a.classification] - order[b.classification];
      }),
      summary: {
        active: summarize(byClass.active),
        slow:   summarize(byClass.slow),
        dead:   summarize(byClass.dead),
        totalInventoryValue: Math.round(result.reduce((s, r) => s + r.inventoryValue, 0) * 100) / 100,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

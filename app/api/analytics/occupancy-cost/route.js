/**
 * GET /api/analytics/occupancy-cost
 *
 * 每日住宿成本效益分析 — FULL OUTER JOIN PmsImportBatch + PurchaseMaster
 *
 * 以「館別 + 日期」為鍵，合併兩個資料來源：
 *   - PmsImportBatch：住宿間數、住宿人數、早餐人數
 *   - PurchaseMaster → PurchaseDetail → Product：採購金額（可依分類篩選）
 *
 * Query params:
 *   startDate  YYYY-MM-DD
 *   endDate    YYYY-MM-DD
 *   warehouse  (optional)
 *   category   (optional) — 限定進貨品項分類，例如「餐廳用品」
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate   = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse');
    const category  = searchParams.get('category') || '';

    // ── 1. PMS 住宿批次資料 ───────────────────────────────────────
    const batchWhere = {};
    if (warehouse) batchWhere.warehouse = warehouse;
    if (startDate || endDate) {
      batchWhere.businessDate = {};
      if (startDate) batchWhere.businessDate.gte = startDate;
      if (endDate)   batchWhere.businessDate.lte = endDate;
    }

    const wfB = applyWarehouseFilter(auth.session, batchWhere);
    if (!wfB.ok) return wfB.response;

    const batches = await prisma.pmsImportBatch.findMany({
      where: batchWhere,
      select: {
        warehouse:      true,
        businessDate:   true,
        occupiedRooms:  true,
        guestCount:     true,
        breakfastCount: true,
        roomCount:      true,
      },
    });

    // ── 2. 進貨資料（依分類篩選） ──────────────────────────────────
    const purchaseWhere = {};
    if (warehouse) purchaseWhere.warehouse = warehouse;
    if (startDate || endDate) {
      purchaseWhere.purchaseDate = {};
      if (startDate) purchaseWhere.purchaseDate.gte = startDate;
      if (endDate)   purchaseWhere.purchaseDate.lte = endDate;
    }

    const wfP = applyWarehouseFilter(auth.session, purchaseWhere);
    if (!wfP.ok) return wfP.response;

    const purchases = await prisma.purchaseMaster.findMany({
      where: purchaseWhere,
      select: {
        purchaseDate: true,
        warehouse:    true,
        details: {
          select: {
            quantity:  true,
            unitPrice: true,
            product:   { select: { category: true } },
          },
        },
      },
      take: 50000,
    });

    // ── 3. 彙整採購金額 by 館別 + 日期（依分類篩選） ──────────────
    const purchaseMap   = new Map(); // "wh|date" → amount
    const allCategories = new Set();

    for (const p of purchases) {
      const key = `${p.warehouse}|${p.purchaseDate}`;
      for (const d of p.details) {
        const cat = d.product?.category || '';
        if (cat) allCategories.add(cat);
        if (!category || cat === category) {
          purchaseMap.set(key, (purchaseMap.get(key) || 0) + Number(d.unitPrice) * d.quantity);
        }
      }
    }

    // ── 4. 彙整 PMS 批次資料 by "wh|date" ────────────────────────
    const batchMap = new Map(); // "wh|date" → batch
    for (const b of batches) {
      const key = `${b.warehouse}|${b.businessDate}`;
      // 若同 wh+date 有多筆批次，累加住客人數（不重複計算）
      if (!batchMap.has(key)) {
        batchMap.set(key, {
          warehouse:      b.warehouse,
          date:           b.businessDate,
          occupiedRooms:  b.occupiedRooms  || 0,
          guestCount:     b.guestCount     || 0,
          breakfastCount: b.breakfastCount || 0,
          roomCount:      b.roomCount      || 0,
        });
      } else {
        const existing = batchMap.get(key);
        existing.occupiedRooms  += b.occupiedRooms  || 0;
        existing.guestCount     += b.guestCount     || 0;
        existing.breakfastCount += b.breakfastCount || 0;
      }
    }

    // ── 5. FULL OUTER JOIN：合併兩個來源的所有 (wh|date) 鍵 ──────
    const allKeys = new Set([...batchMap.keys(), ...purchaseMap.keys()]);

    const rows = Array.from(allKeys)
      .map(key => {
        const batchData = batchMap.get(key);
        const purchaseTotal = purchaseMap.get(key) || 0;

        // 解析 key → warehouse, date
        const sepIdx       = key.indexOf('|');
        const wh           = key.slice(0, sepIdx);
        const dt           = key.slice(sepIdx + 1);

        const occupiedRooms  = batchData?.occupiedRooms  ?? 0;
        const guestCount     = batchData?.guestCount     ?? 0;
        const breakfastCount = batchData?.breakfastCount ?? 0;

        return {
          date:             dt,
          warehouse:        wh,
          hasPmsData:       batchMap.has(key),
          occupiedRooms,
          guestCount,
          breakfastCount,
          purchaseTotal,
          costPerRoom:      occupiedRooms  > 0 ? Math.round(purchaseTotal / occupiedRooms)  : null,
          costPerGuest:     guestCount     > 0 ? Math.round(purchaseTotal / guestCount)     : null,
          costPerBreakfast: breakfastCount > 0 ? Math.round(purchaseTotal / breakfastCount) : null,
        };
      })
      .sort((a, b) =>
        a.date.localeCompare(b.date) || a.warehouse.localeCompare(b.warehouse)
      );

    return NextResponse.json({
      rows,
      categories: Array.from(allCategories).sort(),
      count: rows.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

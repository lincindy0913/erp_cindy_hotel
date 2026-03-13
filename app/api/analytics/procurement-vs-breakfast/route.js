import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * 依「早餐人數」與「指定品項採購量」比較，判斷叫貨是否過高（例：牛奶）
 * Query: yearMonth=2026-03, warehouse (optional), productId (optional), keyword (品名關鍵字，與 productId 二擇一)
 */
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth');
    const warehouse = searchParams.get('warehouse') || null;
    const productIdParam = searchParams.get('productId');
    const keyword = searchParams.get('keyword') || '';

    if (!yearMonth || yearMonth.length < 7) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供 yearMonth（例：2026-03）', 400);
    }

    const monthPrefix = yearMonth.substring(0, 7);

    // 1) 當月早餐人數總計（來自 PmsImportBatch）
    const batchWhere = { businessDate: { startsWith: monthPrefix } };
    if (warehouse) batchWhere.warehouse = warehouse;
    const batches = await prisma.pmsImportBatch.findMany({
      where: batchWhere,
      select: { breakfastCount: true, guestCount: true, occupiedRooms: true },
    });
    const totalBreakfastCount = batches.reduce((s, b) => s + (Number(b.breakfastCount) || 0), 0);
    const totalGuestCount = batches.reduce((s, b) => s + (Number(b.guestCount) || 0), 0);
    const totalOccupiedRooms = batches.reduce((s, b) => s + (Number(b.occupiedRooms) || 0), 0);

    // 2) 當月採購：依 productId 或 keyword 篩選品項
    let productIds = [];
    if (productIdParam) {
      productIds = [parseInt(productIdParam)];
      if (Number.isNaN(productIds[0])) productIds = [];
    }
    if (productIds.length === 0 && keyword.trim()) {
      const products = await prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: keyword.trim(), mode: 'insensitive' } },
            { code: { contains: keyword.trim(), mode: 'insensitive' } },
          ],
          isActive: true,
        },
        select: { id: true },
      });
      productIds = products.map(p => p.id);
    }

    let totalProcurementQty = 0;
    let totalProcurementAmount = 0;
    let productInfo = null;

    if (productIds.length > 0) {
      const purchaseWhere = {
        purchaseMaster: {
          purchaseDate: { startsWith: monthPrefix },
        },
        productId: { in: productIds },
      };
      if (warehouse) purchaseWhere.purchaseMaster.warehouse = warehouse;

      const details = await prisma.purchaseDetail.findMany({
        where: purchaseWhere,
        include: {
          product: { select: { id: true, code: true, name: true, unit: true } },
          purchaseMaster: { select: { purchaseDate: true, warehouse: true } },
        },
      });

      for (const d of details) {
        const qty = Number(d.quantity) || 0;
        const price = Number(d.unitPrice) || 0;
        totalProcurementQty += qty;
        totalProcurementAmount += qty * price;
      }
      if (details.length > 0 && details[0].product) {
        productInfo = {
          id: details[0].product.id,
          code: details[0].product.code,
          name: details[0].product.name,
          unit: details[0].product.unit,
        };
      }
    }

    const perBreakfastQty = totalBreakfastCount > 0 ? Math.round((totalProcurementQty / totalBreakfastCount) * 100) / 100 : null;
    const perBreakfastAmount = totalBreakfastCount > 0 ? Math.round((totalProcurementAmount / totalBreakfastCount) * 100) / 100 : null;

    return NextResponse.json({
      yearMonth: monthPrefix,
      warehouse: warehouse || '全部',
      totalBreakfastCount,
      totalGuestCount,
      totalOccupiedRooms,
      totalProcurementQty,
      totalProcurementAmount,
      perBreakfastQty,
      perBreakfastAmount,
      productInfo,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

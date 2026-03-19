import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/finance/purchase-warehouse-report
 * 按進貨單的館別查詢對應的付款單
 *
 * 資料鏈結：PurchaseMaster → SalesDetail.purchaseId → SalesMaster → PaymentOrder.invoiceIds
 * 同時也查 sourceType='purchasing' + sourceRecordId 直接連結的付款單
 *
 * Query: month (YYYY-MM), warehouse (optional)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const warehouse = searchParams.get('warehouse') || '';
    const supplierId = searchParams.get('supplierId');

    // 需要至少有月份或日期區間
    if (!month && !dateFrom && !dateTo) {
      return NextResponse.json({ groups: {} });
    }

    const purchaseWhere = {};
    if (dateFrom || dateTo) {
      // 使用日期區間
      purchaseWhere.purchaseDate = {};
      if (dateFrom) purchaseWhere.purchaseDate.gte = dateFrom;
      if (dateTo) purchaseWhere.purchaseDate.lte = dateTo;
    } else if (month) {
      // 使用月份
      const monthStart = `${month}-01`;
      const [year, mon] = month.split('-');
      const nextMonth = parseInt(mon) === 12
        ? `${parseInt(year) + 1}-01-01`
        : `${year}-${String(parseInt(mon) + 1).padStart(2, '0')}-01`;
      purchaseWhere.purchaseDate = { gte: monthStart, lt: nextMonth };
    }
    if (warehouse) purchaseWhere.warehouse = warehouse;
    if (supplierId) purchaseWhere.supplierId = parseInt(supplierId);

    const purchases = await prisma.purchaseMaster.findMany({
      where: purchaseWhere,
      select: { id: true, purchaseNo: true, warehouse: true, supplierId: true },
    });

    if (purchases.length === 0) {
      return NextResponse.json({ groups: {} });
    }

    const purchaseIds = purchases.map(p => p.id);
    const purchaseMap = new Map(purchases.map(p => [p.id, p]));

    // === Path 1: 透過發票鏈查詢 ===
    // PurchaseMaster.id → SalesDetail.purchaseId → SalesMaster.id → PaymentOrder.invoiceIds
    const salesDetails = await prisma.salesDetail.findMany({
      where: { purchaseId: { in: purchaseIds } },
      select: { salesId: true, purchaseId: true },
    });

    // Build salesId → purchaseIds mapping
    const salesToPurchases = new Map();
    for (const sd of salesDetails) {
      if (!salesToPurchases.has(sd.salesId)) salesToPurchases.set(sd.salesId, new Set());
      salesToPurchases.get(sd.salesId).add(sd.purchaseId);
    }
    const salesIds = [...salesToPurchases.keys()];

    // Find all payment orders, then filter by invoiceIds containing these salesIds
    // PaymentOrder.invoiceIds is a JSON array of SalesMaster IDs
    let invoiceLinkedOrders = [];
    if (salesIds.length > 0) {
      const allOrders = await prisma.paymentOrder.findMany({
        where: {
          invoiceIds: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Filter orders whose invoiceIds overlap with our salesIds
      for (const order of allOrders) {
        let invIds = [];
        if (Array.isArray(order.invoiceIds)) {
          invIds = order.invoiceIds;
        } else if (typeof order.invoiceIds === 'string') {
          try { invIds = JSON.parse(order.invoiceIds); } catch {}
        }
        const matchingSalesIds = invIds.filter(id => salesToPurchases.has(id));
        if (matchingSalesIds.length > 0) {
          // Get the purchaseIds linked through these salesIds
          const linkedPurchaseIds = new Set();
          for (const sid of matchingSalesIds) {
            for (const pid of salesToPurchases.get(sid)) {
              linkedPurchaseIds.add(pid);
            }
          }
          order._linkedPurchaseIds = [...linkedPurchaseIds];
          invoiceLinkedOrders.push(order);
        }
      }
    }

    // === Path 2: 直接 sourceType + sourceRecordId 連結 ===
    const directOrders = await prisma.paymentOrder.findMany({
      where: {
        sourceType: 'purchasing',
        sourceRecordId: { in: purchaseIds },
      },
      orderBy: { createdAt: 'desc' },
    });
    for (const order of directOrders) {
      order._linkedPurchaseIds = [order.sourceRecordId];
    }

    // Merge and deduplicate
    const orderMap = new Map();
    for (const order of [...invoiceLinkedOrders, ...directOrders]) {
      if (!orderMap.has(order.id)) {
        orderMap.set(order.id, order);
      } else {
        // Merge linked purchase IDs
        const existing = orderMap.get(order.id);
        const merged = new Set([...(existing._linkedPurchaseIds || []), ...(order._linkedPurchaseIds || [])]);
        existing._linkedPurchaseIds = [...merged];
      }
    }

    // Group by purchase warehouse
    const groups = {};
    for (const [, order] of orderMap) {
      const linkedPurchaseIds = order._linkedPurchaseIds || [];
      // Get unique warehouses from linked purchases
      const warehouses = new Set();
      const purchaseNos = [];
      for (const pid of linkedPurchaseIds) {
        const purchase = purchaseMap.get(pid);
        if (purchase) {
          warehouses.add(purchase.warehouse || '未指定館別');
          purchaseNos.push(purchase.purchaseNo);
        }
      }
      // If no warehouse found, use '未指定館別'
      if (warehouses.size === 0) warehouses.add('未指定館別');

      const orderData = {
        id: order.id,
        orderNo: order.orderNo,
        supplierName: order.supplierName || '',
        warehouse: order.warehouse || '',
        paymentMethod: order.paymentMethod,
        netAmount: Number(order.netAmount),
        discount: Number(order.discount),
        status: order.status,
        note: order.note || '',
        createdAt: order.createdAt.toISOString(),
        purchaseNo: purchaseNos.join(', '),
      };

      for (const wh of warehouses) {
        if (!groups[wh]) groups[wh] = [];
        groups[wh].push(orderData);
      }
    }

    return NextResponse.json({ groups });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/finance/purchase-warehouse-report
 * 按進貨單的館別查詢對應的付款單
 * Query: month (YYYY-MM), warehouse (optional)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const warehouse = searchParams.get('warehouse') || '';

    if (!month) {
      return NextResponse.json({ groups: {} });
    }

    // Find purchases in this month (+ optional warehouse filter)
    const monthStart = `${month}-01`;
    const [year, mon] = month.split('-');
    const nextMonth = parseInt(mon) === 12
      ? `${parseInt(year) + 1}-01-01`
      : `${year}-${String(parseInt(mon) + 1).padStart(2, '0')}-01`;

    const purchaseWhere = {
      purchaseDate: { gte: monthStart, lt: nextMonth },
    };
    if (warehouse) purchaseWhere.warehouse = warehouse;

    const purchases = await prisma.purchaseMaster.findMany({
      where: purchaseWhere,
      select: { id: true, purchaseNo: true, warehouse: true },
    });

    if (purchases.length === 0) {
      return NextResponse.json({ groups: {} });
    }

    const purchaseIds = purchases.map(p => p.id);
    const purchaseMap = new Map(purchases.map(p => [p.id, p]));

    // Find payment orders linked to these purchases
    const paymentOrders = await prisma.paymentOrder.findMany({
      where: {
        sourceType: 'purchasing',
        sourceRecordId: { in: purchaseIds },
      },
      include: { executions: true },
      orderBy: { createdAt: 'desc' },
    });

    // Group by purchase warehouse
    const groups = {};
    for (const order of paymentOrders) {
      const purchase = purchaseMap.get(order.sourceRecordId);
      const whKey = purchase?.warehouse || '未指定館別';
      if (!groups[whKey]) groups[whKey] = [];
      groups[whKey].push({
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
        purchaseNo: purchase?.purchaseNo || '',
      });
    }

    return NextResponse.json({ groups });
  } catch (error) {
    return handleApiError(error);
  }
}

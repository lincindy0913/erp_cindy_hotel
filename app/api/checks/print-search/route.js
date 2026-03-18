import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CHECK_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source'); // 'payment' or 'purchase'
    const warehouse = searchParams.get('warehouse');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    if (!source || !warehouse) {
      return NextResponse.json([]);
    }

    let paymentOrderIds = [];

    if (source === 'payment') {
      // 按付款單的館別：找出符合館別＋日期區間的付款單，再找對應支票
      const poWhere = { warehouse };
      if (dateFrom || dateTo) {
        poWhere.dueDate = {};
        if (dateFrom) poWhere.dueDate.gte = dateFrom;
        if (dateTo) poWhere.dueDate.lte = dateTo;
      }
      const orders = await prisma.paymentOrder.findMany({
        where: poWhere,
        select: { id: true },
      });
      paymentOrderIds = orders.map(o => o.id);
    } else if (source === 'purchase') {
      // 按進貨單的館別：找出符合館別＋日期區間的進貨單，再找對應付款單，再找支票
      const pmWhere = { warehouse };
      if (dateFrom || dateTo) {
        pmWhere.purchaseDate = {};
        if (dateFrom) pmWhere.purchaseDate.gte = dateFrom;
        if (dateTo) pmWhere.purchaseDate.lte = dateTo;
      }
      const purchases = await prisma.purchaseMaster.findMany({
        where: pmWhere,
        select: { id: true },
      });
      const purchaseIds = purchases.map(p => p.id);
      if (purchaseIds.length === 0) return NextResponse.json([]);

      // 找到 sourceType='purchasing' 且 sourceRecordId in purchaseIds 的付款單
      const orders = await prisma.paymentOrder.findMany({
        where: {
          sourceType: 'purchasing',
          sourceRecordId: { in: purchaseIds },
        },
        select: { id: true },
      });
      paymentOrderIds = orders.map(o => o.id);
    }

    if (paymentOrderIds.length === 0) return NextResponse.json([]);

    // 找出對應的支票（應付、待兌現/到期）
    const checks = await prisma.check.findMany({
      where: {
        paymentId: { in: paymentOrderIds },
        checkType: 'payable',
        status: { in: ['pending', 'due'] },
      },
      include: {
        sourceAccount: { select: { id: true, name: true, accountCode: true } },
        destinationAccount: { select: { id: true, name: true, accountCode: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return NextResponse.json(checks);
  } catch (error) {
    return handleApiError(error);
  }
}

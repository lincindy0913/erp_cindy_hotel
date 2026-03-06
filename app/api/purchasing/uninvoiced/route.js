import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth');
    const supplierId = searchParams.get('supplierId');
    const warehouse = searchParams.get('warehouse');

    // 取得所有已核銷的 purchaseItemId
    const allSalesDetails = await prisma.salesDetail.findMany({
      select: { purchaseItemId: true }
    });
    const invoicedItemIds = new Set(allSalesDetails.map(d => d.purchaseItemId));

    // 建立進貨單篩選條件
    const purchaseWhere = {};
    if (supplierId) {
      purchaseWhere.supplierId = parseInt(supplierId);
    }
    if (warehouse) {
      purchaseWhere.warehouse = warehouse;
    }
    if (yearMonth) {
      purchaseWhere.purchaseDate = { startsWith: yearMonth };
    }

    const purchases = await prisma.purchaseMaster.findMany({
      where: purchaseWhere,
      include: { details: true },
      orderBy: { purchaseDate: 'asc' }
    });

    const uninvoicedItems = [];

    for (const purchase of purchases) {
      for (let itemIndex = 0; itemIndex < purchase.details.length; itemIndex++) {
        const detail = purchase.details[itemIndex];
        const itemId = `${purchase.id}-${itemIndex}`;

        if (!invoicedItemIds.has(itemId)) {
          uninvoicedItems.push({
            id: itemId,
            purchaseItemId: itemId,
            purchaseId: purchase.id,
            purchaseNo: purchase.purchaseNo,
            purchaseDate: purchase.purchaseDate,
            warehouse: purchase.warehouse || '',
            department: purchase.department || '',
            supplierId: purchase.supplierId,
            productId: detail.productId,
            quantity: detail.quantity,
            unitPrice: Number(detail.unitPrice),
            note: detail.note || '',
            subtotal: detail.quantity * Number(detail.unitPrice)
          });
        }
      }
    }

    return NextResponse.json(uninvoicedItems);
  } catch (error) {
    return handleApiError(error);
  }
}

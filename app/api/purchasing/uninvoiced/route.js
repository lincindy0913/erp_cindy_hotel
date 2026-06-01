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

    // 建立進貨單篩選條件
    const purchaseWhere = {};
    if (supplierId) purchaseWhere.supplierId = parseInt(supplierId);
    if (warehouse)  purchaseWhere.warehouse = warehouse;
    if (yearMonth)  purchaseWhere.purchaseDate = { startsWith: yearMonth };

    // 先取符合條件的進貨單
    const purchases = await prisma.purchaseMaster.findMany({
      where: purchaseWhere,
      include: { details: true },
      orderBy: { purchaseDate: 'asc' }
    });

    // 只查這些進貨單的核銷記錄（避免全表掃 salesDetail）
    const purchaseIds = purchases.map(p => p.id);
    let invoicedItemIds = new Set();
    if (purchaseIds.length > 0) {
      const scopedDetails = await prisma.salesDetail.findMany({
        where: { purchaseId: { in: purchaseIds } },
        select: { purchaseItemId: true },
      });
      invoicedItemIds = new Set(scopedDetails.map(d => d.purchaseItemId));
    }

    const uninvoicedItems = [];

    for (const purchase of purchases) {
      if (purchase.details.length > 0) {
        // 有明細記錄：用 detail.id 當 key（穩定，不隨順序改變）
        for (const detail of purchase.details) {
          const itemId = `${purchase.id}-${detail.id}`;
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
      } else {
        // 無明細記錄：以整張進貨單為一筆虛擬品項（purchaseItemId = "${id}-0"）
        const itemId = `${purchase.id}-0`;
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
            productId: null,
            quantity: 1,
            unitPrice: Number(purchase.totalAmount),
            note: '',
            subtotal: Number(purchase.totalAmount)
          });
        }
      }
    }

    return NextResponse.json(uninvoicedItems);
  } catch (error) {
    return handleApiError(error);
  }
}

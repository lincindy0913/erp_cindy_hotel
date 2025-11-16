import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

/**
 * 取得未核銷的進貨單品項
 * 查詢參數：
 * - yearMonth: 進貨年月 (YYYY-MM)
 * - supplierId: 廠商ID
 * - warehouse: 館別
 */
export async function GET(request) {
  try {
    const store = getStore();
    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth'); // YYYY-MM
    const supplierId = searchParams.get('supplierId');
    const warehouse = searchParams.get('warehouse');

    // 取得所有已核銷的進貨單品項ID
    const invoicedItemIds = new Set();
    store.sales.forEach(sale => {
      if (sale.items) {
        sale.items.forEach(item => {
          if (item.purchaseItemId) {
            invoicedItemIds.add(item.purchaseItemId);
          }
        });
      }
    });

    // 篩選未核銷的進貨單品項
    const uninvoicedItems = [];
    
    store.purchases.forEach(purchase => {
      // 篩選條件：廠商
      if (supplierId && purchase.supplierId !== parseInt(supplierId)) {
        return;
      }
      
      // 篩選條件：館別
      if (warehouse && purchase.warehouse !== warehouse) {
        return;
      }
      
      // 篩選條件：進貨年月
      if (yearMonth) {
        const purchaseYearMonth = purchase.purchaseDate.substring(0, 7); // YYYY-MM
        if (purchaseYearMonth !== yearMonth) {
          return;
        }
      }
      
      // 處理每個進貨單的品項
      if (purchase.items && Array.isArray(purchase.items)) {
        purchase.items.forEach((item, itemIndex) => {
          // 建立唯一ID：purchaseId-itemIndex（用於追蹤核銷狀態）
          const itemId = `${purchase.id}-${itemIndex}`;
          
          // 檢查品項是否已被核銷
          // 如果item本身有id，使用item.id；否則使用itemId
          const checkId = item.id ? `item-${item.id}` : itemId;
          
          // 只包含未核銷的品項
          if (!invoicedItemIds.has(checkId) && !invoicedItemIds.has(itemId)) {
            uninvoicedItems.push({
              id: itemId, // 唯一識別碼（用於前端勾選）
              purchaseItemId: itemId, // 用於追蹤核銷狀態
              purchaseId: purchase.id,
              purchaseNo: purchase.purchaseNo,
              purchaseDate: purchase.purchaseDate,
              warehouse: purchase.warehouse || '',
              department: purchase.department || '',
              supplierId: purchase.supplierId,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              note: item.note || '',
              subtotal: item.quantity * item.unitPrice
            });
          }
        });
      }
    });

    return NextResponse.json(uninvoicedItems);
  } catch (error) {
    console.error('查詢未核銷進貨單品項錯誤:', error);
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 });
  }
}


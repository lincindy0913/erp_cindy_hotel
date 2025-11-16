import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

/**
 * 取得所有發票，並包含廠商和管別資訊
 */
export async function GET(request) {
  try {
    const store = getStore();
    
    // 從進貨單建立發票與廠商、館別的映射
    const invoicesWithInfo = store.sales.map(invoice => {
      let supplierName = '未知廠商';
      let supplierId = null;
      let warehouse = '';

      if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
        // 從第一個 item 的 purchaseId 取得進貨單資訊
        const firstPurchaseId = invoice.items[0].purchaseId;
        const purchase = store.purchases.find(p => p.id === firstPurchaseId);
        
        if (purchase) {
          const supplier = store.suppliers.find(s => s.id === purchase.supplierId);
          supplierName = supplier ? supplier.name : '未知廠商';
          supplierId = purchase.supplierId;
          warehouse = purchase.warehouse || '';
        }
      }

      return {
        ...invoice,
        supplierName,
        supplierId,
        warehouse
      };
    });

    return NextResponse.json(invoicesWithInfo);
  } catch (error) {
    console.error('查詢發票列表錯誤:', error);
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 });
  }
}


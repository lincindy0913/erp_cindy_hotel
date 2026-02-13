import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function GET(request, { params }) {
  try {
    const store = getStore();
    const productId = parseInt(params.id);

    const product = store.products.find(p => p.id === productId);
    if (!product) {
      return NextResponse.json({ error: '產品不存在' }, { status: 404 });
    }

    // 從所有進貨單中找出包含此產品的記錄
    const purchaseRecords = [];

    for (const purchase of (store.purchases || [])) {
      if (!purchase.items) continue;

      for (const item of purchase.items) {
        if (item.productId === productId) {
          const supplier = store.suppliers.find(s => s.id === purchase.supplierId);
          purchaseRecords.push({
            purchaseId: purchase.id,
            purchaseNo: purchase.purchaseNo,
            warehouse: purchase.warehouse || '',
            department: purchase.department || '',
            supplierName: supplier ? supplier.name : '未知廠商',
            purchaseDate: purchase.purchaseDate,
            paymentTerms: purchase.paymentTerms || '',
            status: purchase.status,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
            note: item.note || ''
          });
        }
      }
    }

    // 依日期排序（新到舊）
    purchaseRecords.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));

    return NextResponse.json({
      product,
      purchases: purchaseRecords
    });
  } catch (error) {
    console.error('查詢產品採購記錄錯誤:', error);
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 });
  }
}

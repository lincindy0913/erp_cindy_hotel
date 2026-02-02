import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const store = getStore();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const supplierId = searchParams.get('supplierId');
    
    let priceHistory = store.priceHistory;
    
    if (productId) {
      priceHistory = priceHistory.filter(p => p.productId === parseInt(productId));
    }
    
    if (supplierId) {
      priceHistory = priceHistory.filter(p => p.supplierId === parseInt(supplierId));
    }
    
    // 加入產品和供應商名稱
    const result = priceHistory.map(ph => {
      const product = store.products.find(p => p.id === ph.productId);
      const supplier = store.suppliers.find(s => s.id === ph.supplierId);
      return {
        ...ph,
        productName: product ? product.name : '未知產品',
        supplierName: supplier ? supplier.name : '未知供應商'
      };
    });
    
    return NextResponse.json(result.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate)));
  } catch (error) {
    console.error('查詢歷史價格錯誤:', error);
    return NextResponse.json([]);
  }
}


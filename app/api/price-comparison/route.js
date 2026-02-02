import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const store = getStore();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    
    let comparisons = store.priceComparisons;
    
    if (productId) {
      comparisons = comparisons.filter(c => c.productId === parseInt(productId));
    }
    
    // 加入產品和供應商名稱，並找出最低價
    const result = comparisons.map(comp => {
      const product = store.products.find(p => p.id === comp.productId);
      const supplier = store.suppliers.find(s => s.id === comp.supplierId);
      return {
        ...comp,
        productName: product ? product.name : '未知產品',
        supplierName: supplier ? supplier.name : '未知供應商'
      };
    });
    
    // 找出每個產品的最低價
    const minPrices = {};
    result.forEach(comp => {
      const key = comp.productId;
      if (!minPrices[key] || comp.unitPrice < minPrices[key].price) {
        minPrices[key] = { price: comp.unitPrice, supplierId: comp.supplierId, supplierName: comp.supplierName };
      }
    });
    
    // 標記最低價
    const resultWithMin = result.map(comp => ({
      ...comp,
      isMinPrice: minPrices[comp.productId] && minPrices[comp.productId].supplierId === comp.supplierId
    }));
    
    return NextResponse.json(resultWithMin);
  } catch (error) {
    console.error('查詢比價錯誤:', error);
    return NextResponse.json([]);
  }
}


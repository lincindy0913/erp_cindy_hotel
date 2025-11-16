import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

function getInventoryStatus(currentQty) {
  if (currentQty < 0) return '不足';
  if (currentQty < 10) return '偏低';
  if (currentQty > 1000) return '過多';
  return '正常';
}

export async function GET(request) {
  try {
    const store = getStore();
    
    // 從現有資料計算庫存
    const inventoryMap = new Map();
    
    // 只初始化「列入庫存」的產品
    store.products
      .filter(product => product.isInStock === true)
      .forEach(product => {
        inventoryMap.set(product.id, {
          id: inventoryMap.size + 1,
          productId: product.id,
          beginningQty: 0,
          purchaseQty: 0,
          salesQty: 0,
          currentQty: 0,
          product: product,
          status: '正常'
        });
      });
    
    // 計算進貨數量
    store.purchases.forEach(purchase => {
      purchase.items.forEach(item => {
        const inv = inventoryMap.get(item.productId);
        if (inv) {
          inv.purchaseQty += item.quantity;
        }
      });
    });
    
    // 計算銷貨數量
    store.sales.forEach(sale => {
      sale.items.forEach(item => {
        const inv = inventoryMap.get(item.productId);
        if (inv) {
          inv.salesQty += item.quantity;
        }
      });
    });
    
    // 計算目前庫存和狀態
    const inventory = Array.from(inventoryMap.values()).map(inv => {
      inv.currentQty = inv.beginningQty + inv.purchaseQty - inv.salesQty;
      inv.status = getInventoryStatus(inv.currentQty);
      return inv;
    });
    
    return NextResponse.json(inventory);
  } catch (error) {
    console.error('查詢庫存錯誤:', error);
    return NextResponse.json([]);
  }
}

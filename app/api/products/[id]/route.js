import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function GET(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const product = store.products.find(p => p.id === id);
    
    if (!product) {
      return NextResponse.json({ error: '產品不存在' }, { status: 404 });
    }
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: '查詢產品失敗' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const data = await request.json();
    const productIndex = store.products.findIndex(p => p.id === id);
    
    if (productIndex === -1) {
      return NextResponse.json({ error: '產品不存在' }, { status: 404 });
    }

    // 驗證：如果 isInStock 為 true，warehouseLocation 必須填寫
    if (data.isInStock === true && !data.warehouseLocation) {
      return NextResponse.json({ error: '列入庫存時必須填寫倉庫位置' }, { status: 400 });
    }

    // 處理 isInStock 的轉換
    const isInStock = data.isInStock === true || data.isInStock === 'true' || data.isInStock === '是';
    
    store.products[productIndex] = { 
      ...store.products[productIndex], 
      ...data,
      isInStock: isInStock,
      warehouseLocation: isInStock ? (data.warehouseLocation || null) : null,
      updatedAt: new Date().toISOString()
    };
    return NextResponse.json(store.products[productIndex]);
  } catch (error) {
    return NextResponse.json({ error: '更新產品失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const productIndex = store.products.findIndex(p => p.id === id);
    
    if (productIndex === -1) {
      return NextResponse.json({ error: '產品不存在' }, { status: 404 });
    }

    store.products.splice(productIndex, 1);
    return NextResponse.json({ message: '產品已刪除' });
  } catch (error) {
    return NextResponse.json({ error: '刪除產品失敗' }, { status: 500 });
  }
}

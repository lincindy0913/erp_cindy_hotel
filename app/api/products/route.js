import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const store = getStore();
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');
    
    let products = store.products;
    
    if (keyword) {
      products = products.filter(p => 
        p.code.includes(keyword) || p.name.includes(keyword)
      );
    }
    
    return NextResponse.json(products);
  } catch (error) {
    console.error('查詢產品錯誤:', error);
    const store = getStore();
    return NextResponse.json(store.products);
  }
}

export async function POST(request) {
  try {
    const store = getStore();
    const data = await request.json();
    
    if (!data.code || !data.name || !data.costPrice || !data.salesPrice) {
      return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 });
    }
    
    const existing = store.products.find(p => p.code === data.code);
    if (existing) {
      return NextResponse.json({ error: '產品代碼已存在' }, { status: 409 });
    }
    
    // 驗證：如果 isInStock 為 true，warehouseLocation 必須填寫
    if (data.isInStock === true && !data.warehouseLocation) {
      return NextResponse.json({ error: '列入庫存時必須填寫倉庫位置' }, { status: 400 });
    }

    const newProduct = {
      id: store.counters.product++,
      code: data.code,
      name: data.name,
      category: data.category || '',
      unit: data.unit || '',
      costPrice: parseFloat(data.costPrice),
      salesPrice: parseFloat(data.salesPrice),
      isInStock: data.isInStock === true || data.isInStock === 'true' || data.isInStock === '是',
      warehouseLocation: data.isInStock === true || data.isInStock === 'true' || data.isInStock === '是' ? (data.warehouseLocation || null) : null,
      accountingSubject: data.accountingSubject || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    store.products.push(newProduct);
    return NextResponse.json(newProduct, { status: 201 });
  } catch (error) {
    console.error('建立產品錯誤:', error);
    return NextResponse.json({ error: '建立產品失敗' }, { status: 500 });
  }
}

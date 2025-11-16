import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function GET(request) {
  try {
    const store = getStore();
    console.log('API: 取得進貨單資料, store.purchases.length =', store.purchases?.length || 0);
    console.log('API: store.purchases =', JSON.stringify(store.purchases, null, 2));
    return NextResponse.json(store.purchases || []);
  } catch (error) {
    console.error('查詢進貨單錯誤:', error);
    const store = getStore();
    return NextResponse.json(store.purchases || []);
  }
}

export async function POST(request) {
  try {
    const store = getStore();
    const data = await request.json();

    if (!data.supplierId || !data.items || data.items.length === 0) {
      return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const purchaseNo = `PUR-${today}-${String(store.counters.purchase).padStart(4, '0')}`;

    const newPurchase = {
      id: store.counters.purchase++,
      purchaseNo,
      warehouse: data.warehouse || '',
      department: data.department || '',
      supplierId: parseInt(data.supplierId),
      purchaseDate: data.purchaseDate,
      paymentTerms: data.paymentTerms || '月結',
      taxType: data.taxType || 'tax-excluded',
      amount: data.amount || 0, // 稅前金額
      tax: data.tax || 0,
      totalAmount: data.totalAmount || (parseFloat(data.amount || 0) + parseFloat(data.tax || 0)), // 總金額
      status: data.status || '待入庫',
      items: data.items || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store.purchases.push(newPurchase);
    return NextResponse.json(newPurchase, { status: 201 });
  } catch (error) {
    console.error('建立進貨單錯誤:', error);
    return NextResponse.json({ error: '建立進貨單失敗' }, { status: 500 });
  }
}

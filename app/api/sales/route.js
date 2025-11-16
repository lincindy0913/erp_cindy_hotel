import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function GET(request) {
  try {
    const store = getStore();
    return NextResponse.json(store.sales);
  } catch (error) {
    console.error('查詢銷貨單錯誤:', error);
    const store = getStore();
    return NextResponse.json(store.sales);
  }
}

export async function POST(request) {
  try {
    const store = getStore();
    const data = await request.json();

    // 發票登錄不需要customerId，需要invoiceNo和items
    if (!data.invoiceNo || !data.items || data.items.length === 0) {
      return NextResponse.json({ error: '缺少必填欄位：發票號碼和核銷品項' }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const invoiceNo = data.invoiceNo;
    const salesNo = `INV-${today}-${String(store.counters.sales).padStart(4, '0')}`;

    const newInvoice = {
      id: store.counters.sales++,
      salesNo,
      invoiceNo: invoiceNo,
      invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
      amount: data.amount || 0,
      tax: data.tax || 0,
      totalAmount: data.totalAmount || (parseFloat(data.amount || 0) + parseFloat(data.tax || 0)),
      status: data.status || '待核銷',
      items: data.items || [], // items包含purchaseItemId用於追蹤核銷
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store.sales.push(newInvoice);
    return NextResponse.json(newInvoice, { status: 201 });
  } catch (error) {
    console.error('建立發票錯誤:', error);
    return NextResponse.json({ error: '建立發票失敗' }, { status: 500 });
  }
}

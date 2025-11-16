import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function PUT(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const data = await request.json();
    const paymentIndex = store.payments.findIndex(p => p.id === id);
    
    if (paymentIndex === -1) {
      return NextResponse.json({ error: '付款紀錄不存在' }, { status: 404 });
    }

    const existingPayment = store.payments[paymentIndex];
    
    // 更新付款紀錄（主要用於更新狀態）
    store.payments[paymentIndex] = {
      ...existingPayment,
      status: data.status || existingPayment.status,
      updatedAt: new Date().toISOString()
    };
    
    return NextResponse.json(store.payments[paymentIndex]);
  } catch (error) {
    console.error('更新付款紀錄錯誤:', error);
    return NextResponse.json({ error: '更新付款紀錄失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const paymentIndex = store.payments.findIndex(p => p.id === id);
    
    if (paymentIndex === -1) {
      return NextResponse.json({ error: '付款紀錄不存在' }, { status: 404 });
    }

    store.payments.splice(paymentIndex, 1);
    return NextResponse.json({ message: '付款紀錄已刪除' });
  } catch (error) {
    console.error('刪除付款紀錄錯誤:', error);
    return NextResponse.json({ error: '刪除付款紀錄失敗' }, { status: 500 });
  }
}

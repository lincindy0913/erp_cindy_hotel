import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function PUT(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const data = await request.json();
    const salesIndex = store.sales.findIndex(s => s.id === id);
    
    if (salesIndex === -1) {
      return NextResponse.json({ error: '發票不存在' }, { status: 404 });
    }

    const existingInvoice = store.sales[salesIndex];
    
    // 更新發票
    store.sales[salesIndex] = {
      ...existingInvoice,
      invoiceNo: data.invoiceNo || existingInvoice.invoiceNo,
      invoiceDate: data.invoiceDate || existingInvoice.invoiceDate,
      status: data.status || existingInvoice.status,
      amount: parseFloat(data.amount || 0),
      tax: parseFloat(data.tax || 0),
      totalAmount: data.totalAmount || (parseFloat(data.amount || 0) + parseFloat(data.tax || 0)),
      items: data.items || existingInvoice.items,
      updatedAt: new Date().toISOString()
    };
    
    return NextResponse.json(store.sales[salesIndex]);
  } catch (error) {
    console.error('更新發票錯誤:', error);
    return NextResponse.json({ error: '更新發票失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const salesIndex = store.sales.findIndex(s => s.id === id);
    
    if (salesIndex === -1) {
      return NextResponse.json({ error: '發票不存在' }, { status: 404 });
    }

    // 刪除發票後，相關的進貨單品項將可重新核銷
    store.sales.splice(salesIndex, 1);
    return NextResponse.json({ message: '發票已刪除，相關進貨單品項已可重新核銷' });
  } catch (error) {
    console.error('刪除發票錯誤:', error);
    return NextResponse.json({ error: '刪除發票失敗' }, { status: 500 });
  }
}


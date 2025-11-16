import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function GET(request) {
  try {
    const store = getStore();
    return NextResponse.json(store.expenses || []);
  } catch (error) {
    console.error('查詢支出紀錄錯誤:', error);
    const store = getStore();
    return NextResponse.json(store.expenses || []);
  }
}

export async function POST(request) {
  try {
    const store = getStore();
    const data = await request.json();

    if (!data.invoiceId || !data.invoiceNo || !data.amount) {
      return NextResponse.json({ error: '缺少必填欄位：發票ID、發票號碼和金額' }, { status: 400 });
    }

    const newExpense = {
      id: store.counters.expense++,
      invoiceId: parseInt(data.invoiceId),
      invoiceNo: data.invoiceNo,
      invoiceDate: data.invoiceDate || '',
      amount: parseFloat(data.amount), // 傳票金額
      actualPaymentDate: '', // 實付日期（待登打）
      actualPaymentAmount: 0, // 實付金額（待登打）
      status: '未完成', // 預設狀態為未完成
      supplierId: data.supplierId || null,
      supplierName: data.supplierName || '',
      warehouse: data.warehouse || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!store.expenses) {
      store.expenses = [];
    }
    store.expenses.push(newExpense);
    return NextResponse.json(newExpense, { status: 201 });
  } catch (error) {
    console.error('建立支出紀錄錯誤:', error);
    return NextResponse.json({ error: '建立支出紀錄失敗' }, { status: 500 });
  }
}


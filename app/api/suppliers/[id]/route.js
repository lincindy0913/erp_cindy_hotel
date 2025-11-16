import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function GET(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const supplier = store.suppliers.find(s => s.id === id);
    
    if (!supplier) {
      return NextResponse.json({ error: '廠商不存在' }, { status: 404 });
    }
    return NextResponse.json(supplier);
  } catch (error) {
    return NextResponse.json({ error: '查詢廠商失敗' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const data = await request.json();
    const supplierIndex = store.suppliers.findIndex(s => s.id === id);
    
    if (supplierIndex === -1) {
      return NextResponse.json({ error: '廠商不存在' }, { status: 404 });
    }

    // 驗證必填欄位：廠商名稱、聯絡人、聯絡電話
    if (!data.name || !data.contact || !data.phone) {
      return NextResponse.json({ error: '缺少必填欄位：廠商名稱、聯絡人、聯絡電話' }, { status: 400 });
    }

    // 更新廠商資料，保留原有的ID和時間戳記
    const existingSupplier = store.suppliers[supplierIndex];
    store.suppliers[supplierIndex] = { 
      ...existingSupplier,
      name: data.name,
      taxId: data.taxId || null,
      contact: data.contact,
      phone: data.phone,
      address: data.address || null,
      email: data.email || null,
      paymentTerms: data.paymentTerms || '月結',
      updatedAt: new Date().toISOString()
    };
    
    return NextResponse.json(store.suppliers[supplierIndex]);
  } catch (error) {
    return NextResponse.json({ error: '更新廠商失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const supplierIndex = store.suppliers.findIndex(s => s.id === id);
    
    if (supplierIndex === -1) {
      return NextResponse.json({ error: '廠商不存在' }, { status: 404 });
    }

    store.suppliers.splice(supplierIndex, 1);
    return NextResponse.json({ message: '廠商已刪除' });
  } catch (error) {
    return NextResponse.json({ error: '刪除廠商失敗' }, { status: 500 });
  }
}

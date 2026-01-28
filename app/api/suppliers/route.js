/**
 * 廠商 API 路由
 */

import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function GET(request) {
  try {
    const store = getStore();
    // 依照廠商序號（ID）排序
    const sortedSuppliers = [...store.suppliers].sort((a, b) => (a.id || 0) - (b.id || 0));
    return NextResponse.json(sortedSuppliers);
  } catch (error) {
    console.error('查詢廠商錯誤:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request) {
  try {
    const store = getStore();
    const data = await request.json();

    // 驗證必填欄位：廠商名稱、聯絡人、聯絡電話
    if (!data.name || !data.contact || !data.phone) {
      return NextResponse.json({ error: '缺少必填欄位：廠商名稱、聯絡人、聯絡電話' }, { status: 400 });
    }

    // 產生新的廠商序號（ID）
    const newSupplier = {
      id: store.counters.supplier++,
      name: data.name,
      taxId: data.taxId || null,
      contact: data.contact,
      personInCharge: data.personInCharge || null,
      phone: data.phone,
      address: data.address || null,
      email: data.email || null,
      paymentTerms: data.paymentTerms || '月結',
      contractDate: data.contractDate || null,
      paymentStatus: data.paymentStatus || '未付款',
      remarks: data.remarks || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    store.suppliers.push(newSupplier);
    
    return NextResponse.json(newSupplier, { status: 201 });
  } catch (error) {
    console.error('建立廠商錯誤:', error);
    return NextResponse.json({ error: '建立廠商失敗' }, { status: 500 });
  }
}

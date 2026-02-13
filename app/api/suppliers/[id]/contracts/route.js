/**
 * 廠商合約檔案 API
 * GET: 取得廠商的合約清單
 * POST: 上傳合約檔案
 */

import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function GET(request, { params }) {
  try {
    const store = getStore();
    const supplierId = parseInt(params.id);
    const supplier = store.suppliers.find(s => s.id === supplierId);

    if (!supplier) {
      return NextResponse.json({ error: '廠商不存在' }, { status: 404 });
    }

    const contracts = (store.supplierContracts || [])
      .filter(c => c.supplierId === supplierId)
      .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    return NextResponse.json(contracts);
  } catch (error) {
    console.error('查詢合約錯誤:', error);
    return NextResponse.json({ error: '查詢合約失敗' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const store = getStore();
    const supplierId = parseInt(params.id);
    const supplier = store.suppliers.find(s => s.id === supplierId);

    if (!supplier) {
      return NextResponse.json({ error: '廠商不存在' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: '請選擇檔案' }, { status: 400 });
    }

    // 檢查檔案大小 (限制 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案大小不能超過 10MB' }, { status: 400 });
    }

    // 讀取檔案內容為 base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Data = buffer.toString('base64');

    if (!store.supplierContracts) {
      store.supplierContracts = [];
    }
    if (!store.counters.supplierContract) {
      store.counters.supplierContract = 1;
    }

    const newContract = {
      id: store.counters.supplierContract++,
      supplierId: supplierId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      fileData: base64Data,
      uploadDate: new Date().toISOString()
    };

    store.supplierContracts.push(newContract);

    // 回傳時不包含 fileData（太大了）
    const { fileData, ...contractInfo } = newContract;
    return NextResponse.json(contractInfo, { status: 201 });
  } catch (error) {
    console.error('上傳合約錯誤:', error);
    return NextResponse.json({ error: '上傳合約失敗' }, { status: 500 });
  }
}

/**
 * 廠商合約檔案操作 API
 * GET: 下載合約檔案
 * DELETE: 刪除合約檔案
 */

import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function GET(request, { params }) {
  try {
    const store = getStore();
    const contractId = parseInt(params.contractId);

    const contract = (store.supplierContracts || []).find(c => c.id === contractId);
    if (!contract) {
      return NextResponse.json({ error: '合約不存在' }, { status: 404 });
    }

    // 回傳檔案資料作為下載
    const fileBuffer = Buffer.from(contract.fileData, 'base64');

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contract.fileType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(contract.fileName)}"`,
        'Content-Length': fileBuffer.length.toString()
      }
    });
  } catch (error) {
    console.error('下載合約錯誤:', error);
    return NextResponse.json({ error: '下載合約失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const store = getStore();
    const contractId = parseInt(params.contractId);

    if (!store.supplierContracts) {
      return NextResponse.json({ error: '合約不存在' }, { status: 404 });
    }

    const contractIndex = store.supplierContracts.findIndex(c => c.id === contractId);
    if (contractIndex === -1) {
      return NextResponse.json({ error: '合約不存在' }, { status: 404 });
    }

    store.supplierContracts.splice(contractIndex, 1);
    return NextResponse.json({ message: '合約已刪除' });
  } catch (error) {
    console.error('刪除合約錯誤:', error);
    return NextResponse.json({ error: '刪除合約失敗' }, { status: 500 });
  }
}

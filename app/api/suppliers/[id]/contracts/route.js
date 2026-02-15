import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const supplierId = parseInt(params.id);
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });

    if (!supplier) {
      return NextResponse.json({ error: '廠商不存在' }, { status: 404 });
    }

    const contracts = await prisma.supplierContract.findMany({
      where: { supplierId },
      select: {
        id: true,
        supplierId: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        uploadDate: true
      },
      orderBy: { uploadDate: 'desc' }
    });

    return NextResponse.json(contracts);
  } catch (error) {
    console.error('查詢合約錯誤:', error);
    return NextResponse.json({ error: '查詢合約失敗' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const supplierId = parseInt(params.id);
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });

    if (!supplier) {
      return NextResponse.json({ error: '廠商不存在' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: '請選擇檔案' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案大小不能超過 10MB' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const newContract = await prisma.supplierContract.create({
      data: {
        supplierId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        fileData: buffer
      }
    });

    const { fileData, ...contractInfo } = newContract;
    return NextResponse.json(contractInfo, { status: 201 });
  } catch (error) {
    console.error('上傳合約錯誤:', error);
    return NextResponse.json({ error: '上傳合約失敗' }, { status: 500 });
  }
}

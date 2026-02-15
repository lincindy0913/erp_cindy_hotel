import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const contractId = parseInt(params.contractId);

    const contract = await prisma.supplierContract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return NextResponse.json({ error: '合約不存在' }, { status: 404 });
    }

    return new NextResponse(contract.fileData, {
      headers: {
        'Content-Type': contract.fileType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(contract.fileName)}"`,
        'Content-Length': contract.fileData.length.toString()
      }
    });
  } catch (error) {
    console.error('下載合約錯誤:', error);
    return NextResponse.json({ error: '下載合約失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const contractId = parseInt(params.contractId);

    const contract = await prisma.supplierContract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return NextResponse.json({ error: '合約不存在' }, { status: 404 });
    }

    await prisma.supplierContract.delete({ where: { id: contractId } });
    return NextResponse.json({ message: '合約已刪除' });
  } catch (error) {
    console.error('刪除合約錯誤:', error);
    return NextResponse.json({ error: '刪除合約失敗' }, { status: 500 });
  }
}

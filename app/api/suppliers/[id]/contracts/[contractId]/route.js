import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export async function GET(request, { params }) {
  try {
    const contractId = parseInt(params.contractId);

    const contract = await prisma.supplierContract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return createErrorResponse('NOT_FOUND', '合約不存在', 404);
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
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const contractId = parseInt(params.contractId);

    const contract = await prisma.supplierContract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return createErrorResponse('NOT_FOUND', '合約不存在', 404);
    }

    await prisma.supplierContract.delete({ where: { id: contractId } });
    return NextResponse.json({ message: '合約已刪除' });
  } catch (error) {
    console.error('刪除合約錯誤:', error);
    return handleApiError(error);
  }
}

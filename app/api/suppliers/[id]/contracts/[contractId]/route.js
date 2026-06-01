import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { readContractFile, deleteContractFile } from '@/lib/contract-storage';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const contractId = parseInt((await params).contractId);

    const contract = await prisma.supplierContract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return createErrorResponse('NOT_FOUND', '合約不存在', 404);
    }

    // New records use filesystem; old records fall back to BLOB
    let fileBuffer;
    if (contract.fileUrl) {
      try {
        fileBuffer = readContractFile(contract.fileUrl);
      } catch {
        return createErrorResponse('NOT_FOUND', '合約檔案不存在於磁碟', 404);
      }
    } else if (contract.fileData) {
      fileBuffer = contract.fileData;
    } else {
      return createErrorResponse('NOT_FOUND', '合約無檔案資料', 404);
    }

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contract.fileType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(contract.fileName)}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('下載合約錯誤:', error.message || error);
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const contractId = parseInt((await params).contractId);

    const contract = await prisma.supplierContract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return createErrorResponse('NOT_FOUND', '合約不存在', 404);
    }

    await prisma.supplierContract.delete({ where: { id: contractId } });
    deleteContractFile(contract.fileUrl); // no-op if null or missing
    return NextResponse.json({ message: '合約已刪除' });
  } catch (error) {
    console.error('刪除合約錯誤:', error.message || error);
    return handleApiError(error);
  }
}

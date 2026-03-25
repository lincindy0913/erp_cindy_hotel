import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const supplierId = parseInt(params.id);
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });

    if (!supplier) {
      return createErrorResponse('NOT_FOUND', '廠商不存在', 404);
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
    console.error('查詢合約錯誤:', error.message || error);
    return handleApiError(error);
  }
}

export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const supplierId = parseInt(params.id);
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });

    if (!supplier) {
      return createErrorResponse('NOT_FOUND', '廠商不存在', 404);
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇檔案', 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      return createErrorResponse('VALIDATION_FAILED', '檔案大小不能超過 10MB', 400);
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
    console.error('上傳合約錯誤:', error.message || error);
    return handleApiError(error);
  }
}

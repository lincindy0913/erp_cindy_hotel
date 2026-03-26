import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

// Magic bytes validation — checks file header matches declared MIME type
function validateContractMagicBytes(buffer, mimeType) {
  if (buffer.length < 4) return false;
  const signatures = {
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]],
    'application/msword': [[0xD0, 0xCF, 0x11, 0xE0]],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4B, 0x03, 0x04]],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4B, 0x03, 0x04]],
  };
  const sigs = signatures[mimeType];
  if (!sigs) return true; // No signature defined (e.g. text/csv) — allow
  return sigs.some(sig => sig.every((byte, i) => buffer[i] === byte));
}

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

    // Limit contracts per supplier to prevent DB bloat (binary stored in DB)
    const contractCount = await prisma.supplierContract.count({ where: { supplierId } });
    if (contractCount >= 50) {
      return createErrorResponse('VALIDATION_FAILED', '每個廠商最多 50 份合約，請先刪除舊合約', 400);
    }

    // Validate MIME type — only allow document/image formats
    const allowedTypes = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ];
    if (!allowedTypes.includes(file.type)) {
      return createErrorResponse('VALIDATION_FAILED', '不支援的檔案格式，僅允許 PDF、圖片、Word、Excel、CSV', 400);
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate file content via magic bytes (prevent MIME type spoofing)
    if (!validateContractMagicBytes(buffer, file.type)) {
      return createErrorResponse('VALIDATION_FAILED', '檔案內容與宣告格式不符，疑似偽造檔案', 400);
    }

    // Sanitize filename — strip path components to prevent stored path traversal
    const rawName = file.name || 'unnamed';
    const safeName = rawName.replace(/[/\\:*?"<>|]/g, '_').slice(0, 255);

    const newContract = await prisma.supplierContract.create({
      data: {
        supplierId,
        fileName: safeName,
        fileSize: file.size,
        fileType: file.type,
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

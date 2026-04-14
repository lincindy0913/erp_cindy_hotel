import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireModuleViewPermission, requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';

// Resolve warehouse from source record to enforce warehouse-level access control
const SOURCE_MODULE_MAP = {
  purchasing: { model: 'purchaseMaster', field: 'warehouse' },
  payment_order: { model: 'paymentOrder', field: 'warehouse' },
  expense: { model: 'expenseRecord', field: 'warehouse' },
  check: { model: 'check', field: 'warehouse' },
  cashier: { model: 'cashierExecution', field: null }, // no direct warehouse
  engineering_contract: { model: 'engineeringContract', field: 'warehouse' },
  rental: { model: 'rentalContract', field: 'warehouse' },
};

async function checkSourceWarehouseAccess(session, sourceModule, sourceRecordId) {
  const mapping = SOURCE_MODULE_MAP[sourceModule];
  if (!mapping) return { ok: true }; // unknown module — module-level auth already checked

  if (mapping.field) {
    // Direct warehouse field on the model
    try {
      const record = await prisma[mapping.model]?.findUnique({
        where: { id: sourceRecordId },
        select: { [mapping.field]: true },
      });
      if (!record) return { ok: true }; // record not found — module-level auth already checked
      return assertWarehouseAccess(session, record[mapping.field]);
    } catch {
      return { ok: true }; // best effort — don't block on lookup failures
    }
  }

  // cashierExecution: no direct warehouse — derive via paymentOrder
  if (mapping.model === 'cashierExecution') {
    try {
      const record = await prisma.cashierExecution.findUnique({
        where: { id: sourceRecordId },
        select: { paymentOrder: { select: { warehouse: true } } },
      });
      if (!record) return { ok: true };
      return assertWarehouseAccess(session, record.paymentOrder?.warehouse);
    } catch {
      return { ok: true }; // best effort
    }
  }

  return { ok: true }; // no warehouse field and no special case — skip
}

export const dynamic = 'force-dynamic';

// Magic bytes validation — checks file header matches declared MIME type
function validateMagicBytes(buffer, mimeType) {
  if (buffer.length < 4) return false;

  const signatures = {
    'application/pdf':  [[0x25, 0x50, 0x44, 0x46]],                   // %PDF
    'image/jpeg':       [[0xFF, 0xD8, 0xFF]],                          // JFIF/EXIF
    'image/png':        [[0x89, 0x50, 0x4E, 0x47]],                   // .PNG
    'image/webp':       [[0x52, 0x49, 0x46, 0x46]],                   // RIFF (WebP container)
    'application/msword': [[0xD0, 0xCF, 0x11, 0xE0]],                 // OLE compound
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4B, 0x03, 0x04]], // ZIP (OOXML)
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4B, 0x03, 0x04]],       // ZIP (OOXML)
  };

  const sigs = signatures[mimeType];
  if (!sigs) return true; // No signature defined (e.g. text/csv) — allow

  return sigs.some(sig =>
    sig.every((byte, i) => buffer[i] === byte)
  );
}

// GET - list attachments by sourceModule + sourceRecordId
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceModule = searchParams.get('sourceModule');
    const sourceRecordId = searchParams.get('sourceRecordId');

    if (!sourceModule || !sourceRecordId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 sourceModule 或 sourceRecordId', 400);
    }
    const parsedSourceRecordId = parseInt(sourceRecordId, 10);
    if (Number.isNaN(parsedSourceRecordId)) {
      return createErrorResponse('VALIDATION_FAILED', 'sourceRecordId 格式錯誤', 400);
    }

    const auth = await requireModuleViewPermission(sourceModule);
    if (!auth.ok) return auth.response;

    // Warehouse-level access control on source record
    const warehouseCheck = await checkSourceWarehouseAccess(auth.session, sourceModule, parsedSourceRecordId);
    if (!warehouseCheck.ok) return warehouseCheck.response;

    const attachments = await prisma.attachment.findMany({
      where: {
        sourceModule,
        sourceRecordId: parsedSourceRecordId,
      },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        uploadedBy: true,
        uploadedAt: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    return NextResponse.json(attachments);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST - upload attachment (multipart/form-data)
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const sourceModule = formData.get('sourceModule');
    const sourceRecordId = formData.get('sourceRecordId');

    if (!file || !sourceModule || !sourceRecordId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必要欄位', 400);
    }
    const parsedSourceRecordId = parseInt(sourceRecordId, 10);
    if (Number.isNaN(parsedSourceRecordId)) {
      return createErrorResponse('VALIDATION_FAILED', 'sourceRecordId 格式錯誤', 400);
    }

    const uploadAuth = await requirePermission(PERMISSIONS.ATTACHMENT_UPLOAD);
    if (!uploadAuth.ok) return uploadAuth.response;
    const moduleAuth = await requireModuleViewPermission(sourceModule);
    if (!moduleAuth.ok) return moduleAuth.response;

    // Warehouse-level access control on source record
    const warehouseCheck = await checkSourceWarehouseAccess(uploadAuth.session, sourceModule, parsedSourceRecordId);
    if (!warehouseCheck.ok) return warehouseCheck.response;

    // Validate file size (10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return createErrorResponse('VALIDATION_FAILED', '檔案大小超過 10MB 上限', 400);
    }

    // Validate MIME type
    const allowedTypes = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ];
    if (!allowedTypes.includes(file.type)) {
      return createErrorResponse('VALIDATION_FAILED', '不支援的檔案格式', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate file content via magic bytes (prevent MIME type spoofing)
    if (!validateMagicBytes(buffer, file.type)) {
      return createErrorResponse('VALIDATION_FAILED', '檔案內容與宣告格式不符，疑似偽造檔案', 400);
    }

    const attachment = await prisma.attachment.create({
      data: {
        sourceModule,
        sourceRecordId: parsedSourceRecordId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileData: buffer,
        uploadedBy: uploadAuth.session.user.email || uploadAuth.session.user.name || null,
      },
    });

    return NextResponse.json({
      id: attachment.id,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
      uploadedAt: attachment.uploadedAt,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

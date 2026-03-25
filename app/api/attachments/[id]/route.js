import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireModuleViewPermission, requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

const SOURCE_MODULE_MAP = {
  purchasing: { model: 'purchaseMaster', field: 'warehouse' },
  payment_order: { model: 'paymentOrder', field: 'warehouse' },
  expense: { model: 'expenseRecord', field: 'warehouse' },
  check: { model: 'check', field: 'warehouse' },
  engineering_contract: { model: 'engineeringContract', field: 'warehouse' },
  rental: { model: 'rentalContract', field: 'warehouse' },
};

async function checkAttachmentWarehouseAccess(session, attachment) {
  const mapping = SOURCE_MODULE_MAP[attachment.sourceModule];
  if (!mapping) return { ok: true };
  try {
    const record = await prisma[mapping.model]?.findUnique({
      where: { id: attachment.sourceRecordId },
      select: { [mapping.field]: true },
    });
    if (!record) return { ok: true };
    return assertWarehouseAccess(session, record[mapping.field]);
  } catch {
    return { ok: true };
  }
}

// GET - download attachment
export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id, 10);
    if (Number.isNaN(id)) {
      return createErrorResponse('VALIDATION_FAILED', '附件 ID 格式錯誤', 400);
    }
    const attachment = await prisma.attachment.findUnique({ where: { id } });

    if (!attachment) {
      return createErrorResponse('NOT_FOUND', '附件不存在', 404);
    }
    const auth = await requireModuleViewPermission(attachment.sourceModule);
    if (!auth.ok) return auth.response;

    const wCheck = await checkAttachmentWarehouseAccess(auth.session, attachment);
    if (!wCheck.ok) return wCheck.response;

    const fileName = encodeURIComponent(attachment.fileName);
    return new NextResponse(attachment.fileData, {
      headers: {
        'Content-Type': attachment.fileType,
        'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
        'Content-Length': attachment.fileSize.toString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE - delete attachment
export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id, 10);
    if (Number.isNaN(id)) {
      return createErrorResponse('VALIDATION_FAILED', '附件 ID 格式錯誤', 400);
    }
    const authDelete = await requirePermission(PERMISSIONS.ATTACHMENT_DELETE);
    if (!authDelete.ok) return authDelete.response;

    const attachment = await prisma.attachment.findUnique({ where: { id } });

    if (!attachment) {
      return createErrorResponse('NOT_FOUND', '附件不存在', 404);
    }
    const authModule = await requireModuleViewPermission(attachment.sourceModule);
    if (!authModule.ok) return authModule.response;

    const wCheck = await checkAttachmentWarehouseAccess(authDelete.session, attachment);
    if (!wCheck.ok) return wCheck.response;

    await prisma.attachment.delete({ where: { id } });

    return NextResponse.json({ message: '附件已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}

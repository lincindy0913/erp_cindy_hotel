import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireModuleViewPermission, requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

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

    await prisma.attachment.delete({ where: { id } });

    return NextResponse.json({ message: '附件已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}

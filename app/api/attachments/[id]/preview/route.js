import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET - inline preview
export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    const attachment = await prisma.attachment.findUnique({ where: { id } });

    if (!attachment) {
      return createErrorResponse('NOT_FOUND', '附件不存在', 404);
    }

    // Only allow preview for images and PDFs
    const previewableTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!previewableTypes.includes(attachment.fileType)) {
      return createErrorResponse('VALIDATION_FAILED', '此檔案格式不支援線上預覽，請下載查看', 400);
    }

    return new NextResponse(attachment.fileData, {
      headers: {
        'Content-Type': attachment.fileType,
        'Content-Disposition': 'inline',
        'Content-Length': attachment.fileSize.toString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

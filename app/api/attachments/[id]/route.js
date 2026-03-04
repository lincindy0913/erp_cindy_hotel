import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET - download attachment
export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    const attachment = await prisma.attachment.findUnique({ where: { id } });

    if (!attachment) {
      return createErrorResponse('NOT_FOUND', '附件不存在', 404);
    }

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
    const id = parseInt(params.id);
    const attachment = await prisma.attachment.findUnique({ where: { id } });

    if (!attachment) {
      return createErrorResponse('NOT_FOUND', '附件不存在', 404);
    }

    await prisma.attachment.delete({ where: { id } });

    return NextResponse.json({ message: '附件已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}

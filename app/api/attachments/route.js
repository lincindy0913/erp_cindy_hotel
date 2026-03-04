import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET - list attachments by sourceModule + sourceRecordId
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceModule = searchParams.get('sourceModule');
    const sourceRecordId = searchParams.get('sourceRecordId');

    if (!sourceModule || !sourceRecordId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 sourceModule 或 sourceRecordId', 400);
    }

    const attachments = await prisma.attachment.findMany({
      where: {
        sourceModule,
        sourceRecordId: parseInt(sourceRecordId),
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
    const uploadedBy = formData.get('uploadedBy');

    if (!file || !sourceModule || !sourceRecordId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必要欄位', 400);
    }

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

    const attachment = await prisma.attachment.create({
      data: {
        sourceModule,
        sourceRecordId: parseInt(sourceRecordId),
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileData: buffer,
        uploadedBy: uploadedBy || null,
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

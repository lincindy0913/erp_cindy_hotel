import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// DELETE: Delete a batch and its records (cascade via Prisma)
export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.pmsImportBatch.findUnique({
      where: { id },
      include: { _count: { select: { records: true } } }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '匯入批次不存在', 404);
    }

    // Delete batch (records cascade deleted via onDelete: Cascade)
    await prisma.pmsImportBatch.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: `已刪除批次 ${existing.batchNo}，共 ${existing._count.records} 筆記錄`
    });
  } catch (error) {
    return handleApiError(error);
  }
}

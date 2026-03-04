import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// PUT: Update a single income record
export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.pmsIncomeRecord.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '記錄不存在', 404);
    }

    const updateData = {};
    if (data.warehouse !== undefined) updateData.warehouse = data.warehouse;
    if (data.businessDate !== undefined) updateData.businessDate = data.businessDate;
    if (data.entryType !== undefined) {
      if (!['貸方', '借方'].includes(data.entryType)) {
        return createErrorResponse('VALIDATION_FAILED', '借貸方必須是「貸方」或「借方」', 400);
      }
      updateData.entryType = data.entryType;
    }
    if (data.pmsColumnName !== undefined) updateData.pmsColumnName = data.pmsColumnName;
    if (data.amount !== undefined) {
      // Track original amount if this is first modification
      if (!existing.isModified) {
        updateData.originalAmount = existing.amount;
        updateData.isModified = true;
      }
      updateData.amount = parseFloat(data.amount);
    }
    if (data.accountingCode !== undefined) updateData.accountingCode = data.accountingCode;
    if (data.accountingName !== undefined) updateData.accountingName = data.accountingName;
    if (data.note !== undefined) updateData.note = data.note || null;

    const updated = await prisma.pmsIncomeRecord.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      ...updated,
      amount: Number(updated.amount),
      originalAmount: updated.originalAmount ? Number(updated.originalAmount) : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: Delete a single income record
export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.pmsIncomeRecord.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '記錄不存在', 404);
    }

    await prisma.pmsIncomeRecord.delete({ where: { id } });

    return NextResponse.json({ success: true, message: '記錄已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}

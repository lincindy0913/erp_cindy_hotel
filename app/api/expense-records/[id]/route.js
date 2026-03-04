import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

// GET: Get single record with entryLines
export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);

    const record = await prisma.commonExpenseRecord.findUnique({
      where: { id },
      include: {
        template: {
          select: { id: true, name: true, categoryId: true, category: true }
        },
        entryLines: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!record) {
      return createErrorResponse('NOT_FOUND', '找不到費用記錄', 404);
    }

    const result = {
      ...record,
      totalDebit: Number(record.totalDebit),
      totalCredit: Number(record.totalCredit),
      entryLines: record.entryLines.map(line => ({
        ...line,
        amount: Number(line.amount)
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      confirmedAt: record.confirmedAt ? record.confirmedAt.toISOString() : null,
      voidedAt: record.voidedAt ? record.voidedAt.toISOString() : null
    };

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT: Confirm or Void a record
export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.commonExpenseRecord.findUnique({
      where: { id }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到費用記錄', 404);
    }

    // Action: confirm
    if (data.action === 'confirm') {
      if (existing.status !== '待確認') {
        return createErrorResponse('VALIDATION_FAILED', `無法確認：目前狀態為「${existing.status}」`, 400);
      }

      const updated = await prisma.commonExpenseRecord.update({
        where: { id },
        data: {
          status: '已確認',
          confirmedBy: data.confirmedBy || '系統',
          confirmedAt: new Date()
        },
        include: {
          template: { select: { id: true, name: true } },
          entryLines: { orderBy: { sortOrder: 'asc' } }
        }
      });

      return NextResponse.json({
        ...updated,
        totalDebit: Number(updated.totalDebit),
        totalCredit: Number(updated.totalCredit),
        entryLines: updated.entryLines.map(l => ({ ...l, amount: Number(l.amount) })),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        confirmedAt: updated.confirmedAt ? updated.confirmedAt.toISOString() : null,
        voidedAt: updated.voidedAt ? updated.voidedAt.toISOString() : null
      });
    }

    // Action: void
    if (data.action === 'void') {
      if (existing.status === '已作廢') {
        return createErrorResponse('VALIDATION_FAILED', '此記錄已作廢', 400);
      }

      if (!data.voidReason?.trim()) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '請輸入作廢原因', 400);
      }

      const updated = await prisma.commonExpenseRecord.update({
        where: { id },
        data: {
          status: '已作廢',
          voidedBy: data.voidedBy || '系統',
          voidedAt: new Date(),
          voidReason: data.voidReason.trim()
        },
        include: {
          template: { select: { id: true, name: true } },
          entryLines: { orderBy: { sortOrder: 'asc' } }
        }
      });

      return NextResponse.json({
        ...updated,
        totalDebit: Number(updated.totalDebit),
        totalCredit: Number(updated.totalCredit),
        entryLines: updated.entryLines.map(l => ({ ...l, amount: Number(l.amount) })),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        confirmedAt: updated.confirmedAt ? updated.confirmedAt.toISOString() : null,
        voidedAt: updated.voidedAt ? updated.voidedAt.toISOString() : null
      });
    }

    return createErrorResponse('VALIDATION_FAILED', '無效的操作，請指定 action: confirm 或 void', 400);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: Only if status = 待確認
export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.commonExpenseRecord.findUnique({
      where: { id }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到費用記錄', 404);
    }

    if (existing.status !== '待確認') {
      return createErrorResponse('VALIDATION_FAILED', `無法刪除：目前狀態為「${existing.status}」，僅「待確認」狀態可刪除`, 400);
    }

    await prisma.commonExpenseRecord.delete({ where: { id } });

    return NextResponse.json({ message: '費用記錄已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}

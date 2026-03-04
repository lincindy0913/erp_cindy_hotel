import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

// GET: Get single template with entryLines
export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);

    const template = await prisma.commonExpenseTemplate.findUnique({
      where: { id },
      include: {
        category: true,
        entryLines: {
          orderBy: { sortOrder: 'asc' }
        },
        _count: {
          select: { records: true }
        }
      }
    });

    if (!template) {
      return createErrorResponse('NOT_FOUND', '找不到費用範本', 404);
    }

    const result = {
      ...template,
      entryLines: template.entryLines.map(line => ({
        ...line,
        defaultAmount: line.defaultAmount ? Number(line.defaultAmount) : null,
        createdAt: line.createdAt.toISOString()
      })),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString()
    };

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT: Update template and entryLines
export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.commonExpenseTemplate.findUnique({
      where: { id },
      include: { entryLines: true }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到費用範本', 404);
    }

    if (!data.name?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請輸入範本名稱', 400);
    }

    // Validate debit = credit balance if entryLines provided
    if (data.entryLines && data.entryLines.length > 0) {
      const debitTotal = data.entryLines
        .filter(l => l.entryType === 'debit')
        .reduce((sum, l) => sum + (parseFloat(l.defaultAmount) || 0), 0);
      const creditTotal = data.entryLines
        .filter(l => l.entryType === 'credit')
        .reduce((sum, l) => sum + (parseFloat(l.defaultAmount) || 0), 0);

      if (debitTotal > 0 && creditTotal > 0 && Math.abs(debitTotal - creditTotal) > 0.01) {
        return createErrorResponse('VALIDATION_FAILED', `借貸不平衡：借方 ${debitTotal} ≠ 貸方 ${creditTotal}`, 400);
      }
    }

    // Use transaction to update template and entry lines atomically
    const template = await prisma.$transaction(async (tx) => {
      // Delete existing entry lines
      if (data.entryLines) {
        await tx.templateEntryLine.deleteMany({ where: { templateId: id } });
      }

      // Update template
      const updated = await tx.commonExpenseTemplate.update({
        where: { id },
        data: {
          name: data.name.trim(),
          description: data.description?.trim() || null,
          categoryId: data.categoryId ? parseInt(data.categoryId) : null,
          warehouse: data.warehouse?.trim() || null,
          defaultSupplierId: data.defaultSupplierId ? parseInt(data.defaultSupplierId) : null,
          paymentMethod: data.paymentMethod?.trim() || null,
          isActive: data.isActive !== false,
          sortOrder: data.sortOrder || 0,
          ...(data.entryLines ? {
            entryLines: {
              create: data.entryLines.map((line, idx) => ({
                entryType: line.entryType,
                accountingCode: line.accountingCode,
                accountingName: line.accountingName,
                summary: line.summary?.trim() || null,
                defaultAmount: line.defaultAmount ? parseFloat(line.defaultAmount) : null,
                sortOrder: line.sortOrder ?? idx
              }))
            }
          } : {})
        },
        include: {
          category: true,
          entryLines: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      return updated;
    });

    const result = {
      ...template,
      entryLines: template.entryLines.map(line => ({
        ...line,
        defaultAmount: line.defaultAmount ? Number(line.defaultAmount) : null,
        createdAt: line.createdAt.toISOString()
      })),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString()
    };

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: Delete template (only if no records exist)
export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.commonExpenseTemplate.findUnique({
      where: { id },
      include: {
        _count: { select: { records: true } }
      }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到費用範本', 404);
    }

    if (existing._count.records > 0) {
      return createErrorResponse('VALIDATION_FAILED', `無法刪除：此範本已有 ${existing._count.records} 筆執行記錄，請改為停用`, 400);
    }

    await prisma.commonExpenseTemplate.delete({ where: { id } });

    return NextResponse.json({ message: '費用範本已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}

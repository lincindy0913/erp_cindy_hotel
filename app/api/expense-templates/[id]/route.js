import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

// GET: Get single template with entryLines
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;
  
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
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;
  
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

    const templateType = data.templateType || existing.templateType || 'fixed';
    const hasEntryLines = data.entryLines && data.entryLines.length > 0;
    if (templateType === 'fixed' && !hasEntryLines) {
      return createErrorResponse('VALIDATION_FAILED', '請至少新增一筆會計分錄', 400);
    }

    // Use transaction to update template and entry lines atomically
    const template = await prisma.$transaction(async (tx) => {
      await tx.templateEntryLine.deleteMany({ where: { templateId: id } });

      const updatePayload = {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        templateType: data.templateType || existing.templateType || 'fixed',
        categoryId: data.categoryId ? parseInt(data.categoryId) : null,
        warehouse: data.warehouse?.trim() || null,
        defaultSupplierId: data.defaultSupplierId ? parseInt(data.defaultSupplierId) : null,
        paymentMethod: data.paymentMethod?.trim() || null,
        defaultTaxType: data.defaultTaxType?.trim() || null,
        isActive: data.isActive !== false,
        sortOrder: data.sortOrder || 0,
      };
      // Purchase type: save purchaseItems as JSON
      if ((data.templateType || existing.templateType) === 'purchase') {
        updatePayload.purchaseItems = Array.isArray(data.purchaseItems) ? data.purchaseItems : null;
      }
      if ((data.templateType || existing.templateType) === 'fixed') {
        updatePayload.warehouseAccountMap = Array.isArray(data.warehouseAccountMap) ? data.warehouseAccountMap : null;
        updatePayload.warehouseAmounts = Array.isArray(data.warehouseAmounts) ? data.warehouseAmounts : null;
        updatePayload.defaultDebitCode = data.defaultDebitCode?.trim() || null;
        updatePayload.defaultDebitName = data.defaultDebitName?.trim() || null;
        updatePayload.defaultCreditCode = data.defaultCreditCode?.trim() || null;
        updatePayload.defaultCreditName = data.defaultCreditName?.trim() || null;
      }
      if (data.entryLines?.length > 0) {
        updatePayload.entryLines = {
          create: data.entryLines.map((line, idx) => ({
            entryType: line.entryType,
            accountingCode: line.accountingCode || '',
            accountingName: line.accountingName || '',
            summary: line.summary?.trim() || null,
            defaultAmount: line.defaultAmount ? parseFloat(line.defaultAmount) : null,
            warehouse: line.warehouse?.trim() || null,
            paymentMethod: line.paymentMethod?.trim() || null,
            accountId: line.accountId ? parseInt(line.accountId) : null,
            sortOrder: line.sortOrder ?? idx
          }))
        };
      }

      const updated = await tx.commonExpenseTemplate.update({
        where: { id },
        data: updatePayload,
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
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;
  
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

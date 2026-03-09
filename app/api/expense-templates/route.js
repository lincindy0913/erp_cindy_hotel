import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: List all templates with entryLines, optionally filter by categoryId
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const activeOnly = searchParams.get('activeOnly') !== 'false';
    const templateType = searchParams.get('type'); // purchase or fixed

    const where = {};
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (activeOnly) where.isActive = true;
    if (templateType) where.templateType = templateType;

    const templates = await prisma.commonExpenseTemplate.findMany({
      where,
      include: {
        category: true,
        entryLines: {
          orderBy: { sortOrder: 'asc' }
        },
        _count: {
          select: { records: true }
        }
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    });

    const result = templates.map(t => ({
      ...t,
      entryLines: t.entryLines.map(line => ({
        ...line,
        defaultAmount: line.defaultAmount ? Number(line.defaultAmount) : null,
        createdAt: line.createdAt.toISOString()
      })),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: Create new template with entryLines
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.name?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請輸入範本名稱', 400);
    }

    const templateType = data.templateType || 'fixed';

    // For fixed type: require entry lines with debit/credit balance
    if (templateType === 'fixed') {
      if (!data.entryLines || data.entryLines.length === 0) {
        return createErrorResponse('VALIDATION_FAILED', '請至少新增一筆分錄', 400);
      }

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

    // For purchase type: require purchaseItems
    if (templateType === 'purchase') {
      if (!data.purchaseItems || data.purchaseItems.length === 0) {
        return createErrorResponse('VALIDATION_FAILED', '請至少新增一筆進貨品項', 400);
      }
      if (!data.defaultSupplierId) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '進銷存費用範本必須選擇廠商', 400);
      }
    }

    const templateData = {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      templateType,
      categoryId: data.categoryId ? parseInt(data.categoryId) : null,
      warehouse: data.warehouse?.trim() || null,
      defaultSupplierId: data.defaultSupplierId ? parseInt(data.defaultSupplierId) : null,
      paymentMethod: data.paymentMethod?.trim() || null,
      purchaseItems: templateType === 'purchase' ? (data.purchaseItems || []) : null,
      defaultTaxType: data.defaultTaxType?.trim() || null,
      isActive: data.isActive !== false,
      sortOrder: data.sortOrder || 0,
    };

    // Add entry lines for fixed type
    if (templateType === 'fixed' && data.entryLines?.length > 0) {
      templateData.entryLines = {
        create: data.entryLines.map((line, idx) => ({
          entryType: line.entryType,
          accountingCode: line.accountingCode,
          accountingName: line.accountingName,
          summary: line.summary?.trim() || null,
          defaultAmount: line.defaultAmount ? parseFloat(line.defaultAmount) : null,
          sortOrder: line.sortOrder ?? idx
        }))
      };
    }

    const template = await prisma.commonExpenseTemplate.create({
      data: templateData,
      include: {
        category: true,
        entryLines: {
          orderBy: { sortOrder: 'asc' }
        }
      }
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

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

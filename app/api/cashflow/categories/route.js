import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const categories = await prisma.cashCategory.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        accountingSubject: {
          select: { id: true, code: true, name: true, category: true, subcategory: true }
        }
      }
    });

    const result = categories.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.name || !data.type) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '類別名稱和類型為必填', 400);
    }

    if (!['收入', '支出'].includes(data.type)) {
      return createErrorResponse('VALIDATION_FAILED', '類型必須是「收入」或「支出」', 400);
    }

    const category = await prisma.cashCategory.create({
      data: {
        name: data.name.trim(),
        type: data.type,
        warehouse: data.warehouse || null,
        accountingSubjectId: data.accountingSubjectId ? parseInt(data.accountingSubjectId) : null,
        isActive: true
      },
      include: {
        accountingSubject: {
          select: { id: true, code: true, name: true }
        }
      }
    });

    return NextResponse.json({
      ...category,
      createdAt: category.createdAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const categories = await prisma.cashCategory.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }]
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
        isActive: true
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

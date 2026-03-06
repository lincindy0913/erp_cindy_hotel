import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const methods = await prisma.paymentMethodOption.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    return NextResponse.json(methods);
  } catch (error) {
    console.error('查詢付款方式錯誤:', error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.name) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位：付款方式名稱', 400);
    }

    // Check for duplicate name
    const existing = await prisma.paymentMethodOption.findUnique({
      where: { name: data.name }
    });

    if (existing) {
      return createErrorResponse('CONFLICT_UNIQUE', '付款方式名稱已存在', 409);
    }

    // Get the max sortOrder to append at the end
    const maxSort = await prisma.paymentMethodOption.aggregate({
      _max: { sortOrder: true }
    });
    const nextSortOrder = (maxSort._max.sortOrder || 0) + 1;

    const newMethod = await prisma.paymentMethodOption.create({
      data: {
        name: data.name,
        sortOrder: nextSortOrder
      }
    });

    return NextResponse.json(newMethod, { status: 201 });
  } catch (error) {
    console.error('建立付款方式錯誤:', error);
    return handleApiError(error);
  }
}

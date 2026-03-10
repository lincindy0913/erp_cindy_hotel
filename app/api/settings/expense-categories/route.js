import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;
  
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error('查詢費用分類錯誤:', error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();
    if (!data.name?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請輸入分類名稱', 400);
    }
    const category = await prisma.expenseCategory.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        sortOrder: data.sortOrder || 0,
      },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error.code === 'P2002') {
      return createErrorResponse('CONFLICT_UNIQUE', '分類名稱已存在', 409);
    }
    console.error('新增費用分類錯誤:', error);
    return handleApiError(error);
  }
}

export async function PUT(request) {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id'));
    if (!id) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 ID', 400);

    const data = await request.json();
    const updated = await prisma.expenseCategory.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        description: data.description?.trim() || null,
        sortOrder: data.sortOrder || 0,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('更新費用分類錯誤:', error);
    return handleApiError(error);
  }
}

export async function DELETE(request) {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id'));
    if (!id) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 ID', 400);

    await prisma.expenseCategory.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ message: '分類已刪除' });
  } catch (error) {
    console.error('刪除費用分類錯誤:', error);
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireSession, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// 登入即可讀取（供採購/銷貨等頁面發票抬頭下拉選單使用）
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  
  try {
    const titles = await prisma.invoiceTitle.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    return NextResponse.json(titles);
  } catch (error) {
    console.error('查詢發票抬頭錯誤:', error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.title) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位：發票抬頭名稱', 400);
    }

    // Get the max sortOrder to append at the end
    const maxSort = await prisma.invoiceTitle.aggregate({
      _max: { sortOrder: true }
    });
    const nextSortOrder = (maxSort._max.sortOrder || 0) + 1;

    const newTitle = await prisma.invoiceTitle.create({
      data: {
        title: data.title,
        taxId: data.taxId || null,
        sortOrder: nextSortOrder
      }
    });

    return NextResponse.json(newTitle, { status: 201 });
  } catch (error) {
    console.error('建立發票抬頭錯誤:', error);
    return handleApiError(error);
  }
}

export async function DELETE(request) {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get('id'));
  if (!id) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 ID', 400);

  try {
    await prisma.invoiceTitle.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('刪除發票抬頭錯誤:', error);
    return handleApiError(error);
  }
}

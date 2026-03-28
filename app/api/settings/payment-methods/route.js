import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.PURCHASING_VIEW, PERMISSIONS.FINANCE_VIEW]);
  if (!auth.ok) return auth.response;
  
  try {
    const methods = await prisma.paymentMethodOption.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    return NextResponse.json(methods);
  } catch (error) {
    console.error('查詢付款方式錯誤:', error.message || error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.name) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位：付款方式名稱', 400);
    }

    // Check for duplicate name among active records
    const existing = await prisma.paymentMethodOption.findFirst({
      where: { name: data.name, isActive: true }
    });

    if (existing) {
      return createErrorResponse('CONFLICT_UNIQUE', '付款方式名稱已存在', 409);
    }

    // Check if there's a soft-deleted record with the same name – reactivate it
    const softDeleted = await prisma.paymentMethodOption.findFirst({
      where: { name: data.name, isActive: false }
    });

    if (softDeleted) {
      const reactivated = await prisma.paymentMethodOption.update({
        where: { id: softDeleted.id },
        data: { isActive: true }
      });
      return NextResponse.json(reactivated, { status: 201 });
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
    console.error('建立付款方式錯誤:', error.message || error);
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
    await prisma.paymentMethodOption.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('刪除付款方式錯誤:', error.message || error);
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
    await prisma.paymentMethodOption.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('刪除付款方式錯誤:', error);
    return handleApiError(error);
  }
}

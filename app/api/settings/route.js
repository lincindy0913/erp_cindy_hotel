import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const configs = await prisma.systemConfig.findMany({
      orderBy: { key: 'asc' }
    });

    return NextResponse.json(configs);
  } catch (error) {
    console.error('查詢系統設定錯誤:', error);
    return handleApiError(error);
  }
}

export async function PUT(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    if (!data.key) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少設定鍵值 (key)', 400);
    }

    const existing = await prisma.systemConfig.findUnique({
      where: { key: data.key }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', `找不到設定項目: ${data.key}`, 404);
    }

    if (!existing.isEditable) {
      return createErrorResponse('FORBIDDEN', '此設定項目不可編輯', 403);
    }

    const updated = await prisma.systemConfig.update({
      where: { key: data.key },
      data: {
        value: String(data.value),
        updatedBy: data.updatedBy || null
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('更新系統設定錯誤:', error);
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const configs = await prisma.systemConfig.findMany({
      orderBy: { key: 'asc' }
    });
    // 回傳 key-value 物件供設定頁表單使用
    const keyValue = {};
    configs.forEach(c => { keyValue[c.key] = c.value; });
    return NextResponse.json(keyValue);
  } catch (error) {
    console.error('查詢系統設定錯誤:', error.message || error);
    return handleApiError(error);
  }
}

export async function PUT(request) {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    if (!data.key) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少設定鍵值 (key)', 400);
    }

    const existing = await prisma.systemConfig.findUnique({
      where: { key: data.key }
    });

    let result;
    if (existing) {
      if (!existing.isEditable) {
        return createErrorResponse('FORBIDDEN', '此設定項目不可編輯', 403);
      }
      result = await prisma.systemConfig.update({
        where: { key: data.key },
        data: {
          value: String(data.value),
          updatedBy: data.updatedBy || null
        }
      });
    } else {
      result = await prisma.systemConfig.create({
        data: {
          key: data.key,
          value: String(data.value),
          isEditable: true,
          updatedBy: data.updatedBy || null
        }
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('更新系統設定錯誤:', error.message || error);
    return handleApiError(error);
  }
}

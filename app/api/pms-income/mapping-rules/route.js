import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET - 取得所有 PMS 科目對應規則
export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;
  
  try {
    const rules = await prisma.pmsMappingRule.findMany({
      orderBy: [{ entryType: 'asc' }, { sortOrder: 'asc' }],
    });
    return NextResponse.json(rules);
  } catch (error) {
    console.error('Error fetching PMS mapping rules:', error.message || error);
    return handleApiError(error);
  }
}

// POST - 新增 PMS 科目對應規則
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.PMS_IMPORT);
  if (!auth.ok) return auth.response;
  
  try {
    const body = await request.json();
    const { pmsColumnName, entryType, accountingCode, accountingName, description } = body;

    if (!pmsColumnName || !entryType || !accountingCode || !accountingName) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫必要欄位', 400);
    }

    if (!['貸方', '借方'].includes(entryType)) {
      return createErrorResponse('VALIDATION_FAILED', 'entryType 必須為 貸方 或 借方', 400);
    }

    // Check for duplicate
    const existing = await prisma.pmsMappingRule.findUnique({
      where: { pmsColumnName_entryType: { pmsColumnName, entryType } },
    });
    if (existing) {
      return createErrorResponse('CONFLICT_UNIQUE', `「${pmsColumnName}」(${entryType}) 已存在對應規則`, 409);
    }

    // Get max sortOrder
    const maxSort = await prisma.pmsMappingRule.aggregate({
      _max: { sortOrder: true },
      where: { entryType },
    });

    const rule = await prisma.pmsMappingRule.create({
      data: {
        pmsColumnName,
        entryType,
        accountingCode,
        accountingName,
        description: description || null,
        isSystemDefault: false,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error('Error creating PMS mapping rule:', error.message || error);
    return handleApiError(error);
  }
}

// PUT - 更新 PMS 科目對應規則
export async function PUT(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 id 參數', 400);
    }

    const body = await request.json();
    const { accountingCode, accountingName, description } = body;

    const existing = await prisma.pmsMappingRule.findUnique({
      where: { id: parseInt(id) },
    });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到此對應規則', 404);
    }

    const updateData = {};
    if (accountingCode !== undefined) updateData.accountingCode = accountingCode;
    if (accountingName !== undefined) updateData.accountingName = accountingName;
    if (description !== undefined) updateData.description = description;

    const rule = await prisma.pmsMappingRule.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    return NextResponse.json(rule);
  } catch (error) {
    console.error('Error updating PMS mapping rule:', error.message || error);
    return handleApiError(error);
  }
}

// DELETE - 刪除 PMS 科目對應規則 (僅限非系統預設)
export async function DELETE(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 id 參數', 400);
    }

    const existing = await prisma.pmsMappingRule.findUnique({
      where: { id: parseInt(id) },
    });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到此對應規則', 404);
    }

    if (existing.isSystemDefault) {
      return createErrorResponse('VALIDATION_FAILED', '系統預設對應規則無法刪除', 400);
    }

    await prisma.pmsMappingRule.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ message: '刪除成功' });
  } catch (error) {
    console.error('Error deleting PMS mapping rule:', error.message || error);
    return handleApiError(error);
  }
}

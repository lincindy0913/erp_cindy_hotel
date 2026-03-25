import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET - 取得所有會計科目（登入即可檢視）
export async function GET() {
  const { requireSession } = await import('@/lib/api-auth');
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  
  try {
    const subjects = await prisma.accountingSubject.findMany({
      orderBy: { code: 'asc' }
    });
    return NextResponse.json(subjects);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST - 新增會計科目
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;
  
  try {
    const body = await request.json();

    // 批量匯入
    if (Array.isArray(body)) {
      const results = await prisma.$transaction(
        body.map(item =>
          prisma.accountingSubject.upsert({
            where: { code: item.code },
            update: {
              category: item.category,
              subcategory: item.subcategory,
              name: item.name,
            },
            create: {
              category: item.category,
              subcategory: item.subcategory,
              code: item.code,
              name: item.name,
            },
          })
        )
      );
      return NextResponse.json({ message: `成功匯入 ${results.length} 筆會計科目`, count: results.length });
    }

    // 單筆新增
    const category = body.category != null ? String(body.category).trim() : '';
    const subcategory = body.subcategory != null ? String(body.subcategory).trim() : '';
    const code = body.code != null ? String(body.code).trim() : '';
    const name = body.name != null ? String(body.name).trim() : '';
    if (!category || !subcategory || !code || !name) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫分類、類別、代碼與名稱', 400);
    }

    const existing = await prisma.accountingSubject.findUnique({ where: { code } });
    if (existing) {
      return createErrorResponse('CONFLICT_UNIQUE', `代碼 ${code} 已存在`, 409);
    }

    const subject = await prisma.accountingSubject.create({
      data: { category, subcategory, code, name }
    });
    return NextResponse.json(subject, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE - 刪除會計科目
export async function DELETE(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 id 參數', 400);
    }

    const parsedId = parseInt(id);

    // Check referential integrity before deleting
    const refCount = await prisma.cashCategory.count({
      where: { accountingSubjectId: parsedId }
    });
    if (refCount > 0) {
      return createErrorResponse('ACCOUNT_HAS_DEPENDENCIES', `此會計科目已被 ${refCount} 筆現金分類引用，無法刪除`, 400);
    }

    await prisma.accountingSubject.delete({
      where: { id: parsedId }
    });

    return NextResponse.json({ message: '刪除成功' });
  } catch (error) {
    return handleApiError(error);
  }
}

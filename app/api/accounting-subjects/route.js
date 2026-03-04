import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError, ErrorCodes } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET - 取得所有會計科目
export async function GET() {
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
    const { category, subcategory, code, name } = body;
    if (!category || !subcategory || !code || !name) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '所有欄位皆為必填', 400);
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
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 id 參數', 400);
    }

    await prisma.accountingSubject.delete({
      where: { id: parseInt(id) }
    });

    return NextResponse.json({ message: '刪除成功' });
  } catch (error) {
    return handleApiError(error);
  }
}

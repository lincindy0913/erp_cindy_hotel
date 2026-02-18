import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - 取得所有會計科目
export async function GET() {
  try {
    const subjects = await prisma.accountingSubject.findMany({
      orderBy: { code: 'asc' }
    });
    return NextResponse.json(subjects);
  } catch (error) {
    console.error('Error fetching accounting subjects:', error);
    return NextResponse.json({ error: '取得會計科目失敗' }, { status: 500 });
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
      return NextResponse.json({ error: '所有欄位皆為必填' }, { status: 400 });
    }

    const existing = await prisma.accountingSubject.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: `代碼 ${code} 已存在` }, { status: 400 });
    }

    const subject = await prisma.accountingSubject.create({
      data: { category, subcategory, code, name }
    });
    return NextResponse.json(subject, { status: 201 });
  } catch (error) {
    console.error('Error creating accounting subject:', error);
    return NextResponse.json({ error: '新增會計科目失敗' }, { status: 500 });
  }
}

// DELETE - 刪除會計科目
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少 id 參數' }, { status: 400 });
    }

    await prisma.accountingSubject.delete({
      where: { id: parseInt(id) }
    });

    return NextResponse.json({ message: '刪除成功' });
  } catch (error) {
    console.error('Error deleting accounting subject:', error);
    return NextResponse.json({ error: '刪除會計科目失敗' }, { status: 500 });
  }
}

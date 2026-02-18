import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const categories = await prisma.cashCategory.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }]
    });

    const result = categories.map(c => ({
      ...c,
      createdAt: c.createdAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('查詢資金類別錯誤:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request) {
  try {
    const data = await request.json();

    if (!data.name || !data.type) {
      return NextResponse.json({ error: '類別名稱和類型為必填' }, { status: 400 });
    }

    if (!['收入', '支出'].includes(data.type)) {
      return NextResponse.json({ error: '類型必須是「收入」或「支出」' }, { status: 400 });
    }

    const category = await prisma.cashCategory.create({
      data: {
        name: data.name.trim(),
        type: data.type,
        warehouse: data.warehouse || null,
        isActive: true
      }
    });

    return NextResponse.json({
      ...category,
      createdAt: category.createdAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('建立資金類別錯誤:', error);
    return NextResponse.json({ error: '建立資金類別失敗' }, { status: 500 });
  }
}

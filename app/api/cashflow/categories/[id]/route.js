import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.type !== undefined) updateData.type = data.type;
    if (data.warehouse !== undefined) updateData.warehouse = data.warehouse || null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const category = await prisma.cashCategory.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      ...category,
      createdAt: category.createdAt.toISOString()
    });
  } catch (error) {
    console.error('更新資金類別錯誤:', error);
    return NextResponse.json({ error: '更新失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const txCount = await prisma.cashTransaction.count({ where: { categoryId: id } });
    if (txCount > 0) {
      return NextResponse.json({ error: '此類別有交易紀錄，無法刪除' }, { status: 400 });
    }

    await prisma.cashCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('刪除資金類別錯誤:', error);
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 });
  }
}

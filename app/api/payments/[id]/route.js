import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '付款紀錄不存在' }, { status: 404 });
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        status: data.status || existing.status
      }
    });

    return NextResponse.json({
      ...updated,
      amount: Number(updated.amount),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    });
  } catch (error) {
    console.error('更新付款紀錄錯誤:', error);
    return NextResponse.json({ error: '更新付款紀錄失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '付款紀錄不存在' }, { status: 404 });
    }

    await prisma.payment.delete({ where: { id } });
    return NextResponse.json({ message: '付款紀錄已刪除' });
  } catch (error) {
    console.error('刪除付款紀錄錯誤:', error);
    return NextResponse.json({ error: '刪除付款紀錄失敗' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.cashAccount.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '帳戶不存在' }, { status: 404 });
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.type !== undefined) updateData.type = data.type;
    if (data.warehouse !== undefined) updateData.warehouse = data.warehouse;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.openingBalance !== undefined) {
      const newOpening = parseFloat(data.openingBalance);
      const diff = newOpening - Number(existing.openingBalance);
      updateData.openingBalance = newOpening;
      updateData.currentBalance = Number(existing.currentBalance) + diff;
    }

    const account = await prisma.cashAccount.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      ...account,
      openingBalance: Number(account.openingBalance),
      currentBalance: Number(account.currentBalance),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString()
    });
  } catch (error) {
    console.error('更新資金帳戶錯誤:', error);
    return NextResponse.json({ error: '更新失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const txCount = await prisma.cashTransaction.count({
      where: { OR: [{ accountId: id }, { transferAccountId: id }] }
    });

    if (txCount > 0) {
      return NextResponse.json({ error: '此帳戶有交易紀錄，無法刪除。請先停用帳戶。' }, { status: 400 });
    }

    await prisma.cashAccount.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('刪除資金帳戶錯誤:', error);
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 });
  }
}

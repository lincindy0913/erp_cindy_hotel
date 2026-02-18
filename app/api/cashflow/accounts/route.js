import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const accounts = await prisma.cashAccount.findMany({
      orderBy: [{ warehouse: 'asc' }, { type: 'asc' }, { name: 'asc' }]
    });

    const result = accounts.map(a => ({
      ...a,
      openingBalance: Number(a.openingBalance),
      currentBalance: Number(a.currentBalance),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('查詢資金帳戶錯誤:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request) {
  try {
    const data = await request.json();

    if (!data.name || !data.type || !data.warehouse) {
      return NextResponse.json({ error: '帳戶名稱、類型、館別為必填' }, { status: 400 });
    }

    const openingBalance = parseFloat(data.openingBalance) || 0;

    const account = await prisma.cashAccount.create({
      data: {
        name: data.name.trim(),
        type: data.type,
        warehouse: data.warehouse,
        openingBalance,
        currentBalance: openingBalance,
        isActive: true
      }
    });

    return NextResponse.json({
      ...account,
      openingBalance: Number(account.openingBalance),
      currentBalance: Number(account.currentBalance),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('建立資金帳戶錯誤:', error);
    return NextResponse.json({ error: '建立資金帳戶失敗' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const expenses = await prisma.expense.findMany({
      orderBy: { id: 'asc' }
    });

    const result = expenses.map(e => ({
      ...e,
      amount: Number(e.amount),
      actualPaymentAmount: Number(e.actualPaymentAmount),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('查詢支出紀錄錯誤:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request) {
  try {
    const data = await request.json();

    if (!data.invoiceId || !data.invoiceNo || !data.amount) {
      return NextResponse.json({ error: '缺少必填欄位：發票ID、發票號碼和金額' }, { status: 400 });
    }

    const newExpense = await prisma.expense.create({
      data: {
        invoiceId: parseInt(data.invoiceId),
        invoiceNo: data.invoiceNo,
        invoiceDate: data.invoiceDate || '',
        amount: parseFloat(data.amount),
        actualPaymentDate: '',
        actualPaymentAmount: 0,
        status: '未完成',
        supplierId: data.supplierId ? parseInt(data.supplierId) : null,
        supplierName: data.supplierName || '',
        warehouse: data.warehouse || ''
      }
    });

    return NextResponse.json({
      ...newExpense,
      amount: Number(newExpense.amount),
      actualPaymentAmount: Number(newExpense.actualPaymentAmount),
      createdAt: newExpense.createdAt.toISOString(),
      updatedAt: newExpense.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    console.error('建立支出紀錄錯誤:', error);
    return NextResponse.json({ error: '建立支出紀錄失敗' }, { status: 500 });
  }
}

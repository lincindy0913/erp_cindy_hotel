import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

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
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    const data = await request.json();

    if (!data.invoiceId || !data.invoiceNo || !data.amount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位：發票ID、發票號碼和金額', 400);
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
    return handleApiError(error);
  }
}

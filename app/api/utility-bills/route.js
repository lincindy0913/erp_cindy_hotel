import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET: 列表，可篩選 館別、年、月、類型
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const billType = searchParams.get('billType');

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (year) where.billYear = parseInt(year, 10);
    if (month) where.billMonth = parseInt(month, 10);
    if (billType) where.billType = billType;

    const list = await prisma.utilityBillRecord.findMany({
      where,
      orderBy: [{ billYear: 'desc' }, { billMonth: 'desc' }, { warehouse: 'asc' }],
    });

    return NextResponse.json(list.map(r => ({
      id: r.id,
      warehouse: r.warehouse,
      billYear: r.billYear,
      billMonth: r.billMonth,
      billType: r.billType,
      summaryJson: r.summaryJson,
      fileName: r.fileName,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 儲存一筆解析結果
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { warehouse, billYear, billMonth, billType, summaryJson, fileName } = body;

    if (!warehouse || billYear == null || billMonth == null || !billType || !summaryJson) {
      return NextResponse.json(
        { error: '缺少欄位：warehouse, billYear, billMonth, billType, summaryJson' },
        { status: 400 }
      );
    }

    const year = parseInt(billYear, 10);
    const month = parseInt(billMonth, 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: '年度或月份不正確' }, { status: 400 });
    }

    const data = {
      warehouse: String(warehouse).trim(),
      billYear: year,
      billMonth: month,
      billType: billType === '水費' ? '水費' : '電費',
      summaryJson: typeof summaryJson === 'string' ? summaryJson : JSON.stringify(summaryJson),
      fileName: fileName ? String(fileName).trim() : null,
    };

    const record = await prisma.utilityBillRecord.upsert({
      where: {
        warehouse_billYear_billMonth_billType: {
          warehouse: data.warehouse,
          billYear: data.billYear,
          billMonth: data.billMonth,
          billType: data.billType,
        },
      },
      create: data,
      update: { summaryJson: data.summaryJson, fileName: data.fileName },
    });

    return NextResponse.json({
      id: record.id,
      message: '已儲存',
      warehouse: record.warehouse,
      billYear: record.billYear,
      billMonth: record.billMonth,
      billType: record.billType,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

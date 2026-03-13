import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

// GET: 查詢員工代墊款清單
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const employeeName = searchParams.get('employeeName');

    const where = {};
    if (status) where.status = status;
    if (employeeName) where.employeeName = employeeName;

    const records = await prisma.employeeAdvance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error('GET /api/employee-advances error:', error);
    return handleApiError(error);
  }
}

// POST: 手動新增代墊款紀錄
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { employeeName, paymentMethod, amount, sourceDescription, expenseName, summary, warehouse, note } = body;

    if (!employeeName || !amount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫代墊員工和金額', 400);
    }

    // Generate advanceNo: ADV-YYYYMMDD-XXXX
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const prefix = `ADV-${dateStr}-`;
    const existing = await prisma.employeeAdvance.findMany({
      where: { advanceNo: { startsWith: prefix } },
      select: { advanceNo: true },
    });
    let maxSeq = 0;
    for (const item of existing) {
      const seq = parseInt(item.advanceNo.substring(prefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
    const advanceNo = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;

    const record = await prisma.employeeAdvance.create({
      data: {
        advanceNo,
        employeeName,
        paymentMethod: paymentMethod || '現金',
        sourceType: 'other',
        sourceDescription: sourceDescription || null,
        expenseName: expenseName || null,
        summary: summary || null,
        amount: parseFloat(amount),
        status: '待結算',
        warehouse: warehouse || null,
        note: note || null,
        createdBy: session?.user?.email || null,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('POST /api/employee-advances error:', error);
    return handleApiError(error);
  }
}

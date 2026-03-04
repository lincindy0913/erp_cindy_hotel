import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET: List PMS income records with filters and pagination
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const entryType = searchParams.get('entryType');
    const accountingCode = searchParams.get('accountingCode');
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 50;

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (entryType) where.entryType = entryType;
    if (accountingCode) where.accountingCode = accountingCode;
    if (startDate && endDate) {
      where.businessDate = { gte: startDate, lte: endDate };
    } else if (startDate) {
      where.businessDate = { gte: startDate };
    } else if (endDate) {
      where.businessDate = { lte: endDate };
    }

    const [records, total] = await Promise.all([
      prisma.pmsIncomeRecord.findMany({
        where,
        include: {
          importBatch: {
            select: { id: true, batchNo: true, fileName: true }
          }
        },
        orderBy: [{ businessDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.pmsIncomeRecord.count({ where })
    ]);

    const result = records.map(r => ({
      ...r,
      amount: Number(r.amount),
      originalAmount: r.originalAmount ? Number(r.originalAmount) : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }));

    return NextResponse.json({
      records: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: Create manual income record
export async function POST(request) {
  try {
    const data = await request.json();

    if (!data.warehouse || !data.businessDate || !data.entryType || !data.pmsColumnName || data.amount === undefined || !data.accountingCode || !data.accountingName) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '館別、營業日期、借貸方、PMS欄位名、金額、會計科目代碼及名稱為必填', 400);
    }

    if (!['貸方', '借方'].includes(data.entryType)) {
      return createErrorResponse('VALIDATION_FAILED', '借貸方必須是「貸方」或「借方」', 400);
    }

    const record = await prisma.pmsIncomeRecord.create({
      data: {
        warehouse: data.warehouse,
        businessDate: data.businessDate,
        entryType: data.entryType,
        pmsColumnName: data.pmsColumnName,
        amount: parseFloat(data.amount),
        accountingCode: data.accountingCode,
        accountingName: data.accountingName,
        note: data.note || null,
        isModified: false
      }
    });

    return NextResponse.json({
      ...record,
      amount: Number(record.amount),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

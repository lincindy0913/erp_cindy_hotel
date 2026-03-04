import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET: List all bank formats
export async function GET() {
  try {
    const formats = await prisma.bankAccountFormat.findMany({
      orderBy: [{ isBuiltIn: 'desc' }, { bankName: 'asc' }]
    });

    const result = formats.map(f => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: Create custom bank format
export async function POST(request) {
  try {
    const data = await request.json();

    if (!data.bankName) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '銀行名稱為必填', 400);
    }

    const format = await prisma.bankAccountFormat.create({
      data: {
        bankName: data.bankName.trim(),
        bankCode: data.bankCode || null,
        fileEncoding: data.fileEncoding || 'UTF-8',
        fileType: data.fileType || 'csv',
        hasHeaderRow: data.hasHeaderRow !== false,
        headerRowIndex: data.headerRowIndex || 0,
        skipTopRows: data.skipTopRows || 0,
        skipBottomRows: data.skipBottomRows || 0,
        dateColumn: data.dateColumn || null,
        dateFormat: data.dateFormat || null,
        descriptionColumn: data.descriptionColumn || null,
        debitColumn: data.debitColumn || null,
        creditColumn: data.creditColumn || null,
        amountColumn: data.amountColumn || null,
        balanceColumn: data.balanceColumn || null,
        referenceColumn: data.referenceColumn || null,
        closingBalanceCell: data.closingBalanceCell || null,
        isBuiltIn: false,
        sampleRow: data.sampleRow || null
      }
    });

    return NextResponse.json({
      ...format,
      createdAt: format.createdAt.toISOString(),
      updatedAt: format.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

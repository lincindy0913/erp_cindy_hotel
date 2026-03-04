import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { id: 'asc' }
    });
    return NextResponse.json(suppliers);
  } catch (error) {
    console.error('查詢廠商錯誤:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request) {
  try {
    const data = await request.json();

    if (!data.name || !data.taxId || !data.contact || !data.personInCharge || !data.phone) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位：廠商名稱、統一編號、聯絡人、負責人、聯絡電話', 400);
    }

    const newSupplier = await prisma.supplier.create({
      data: {
        name: data.name,
        taxId: data.taxId || null,
        contact: data.contact,
        personInCharge: data.personInCharge || null,
        phone: data.phone,
        address: data.address || null,
        email: data.email || null,
        paymentTerms: data.paymentTerms || '月結',
        contractDate: data.contractDate || null,
        contractEndDate: data.contractEndDate || null,
        paymentStatus: data.paymentStatus || '未付款',
        remarks: data.remarks || null
      }
    });

    return NextResponse.json(newSupplier, { status: 201 });
  } catch (error) {
    console.error('建立廠商錯誤:', error);
    return handleApiError(error);
  }
}

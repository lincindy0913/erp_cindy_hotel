import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const taxYear = searchParams.get('taxYear');
    const status = searchParams.get('status');
    const propertyId = searchParams.get('propertyId');

    const where = {};
    if (taxYear) where.taxYear = parseInt(taxYear);
    if (status) where.status = status;
    if (propertyId) where.propertyId = parseInt(propertyId);

    const taxes = await prisma.propertyTax.findMany({
      where,
      include: {
        property: { select: { id: true, name: true, buildingName: true } }
      },
      orderBy: [{ taxYear: 'desc' }, { dueDate: 'asc' }]
    });

    return NextResponse.json(taxes);
  } catch (error) {
    console.error('GET /api/rentals/taxes error:', error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { propertyId, taxYear, taxType, dueDate, amount } = body;

    if (!propertyId || !taxYear || !taxType || !dueDate || !amount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }

    const tax = await prisma.propertyTax.create({
      data: {
        propertyId: parseInt(propertyId),
        taxYear: parseInt(taxYear),
        taxType,
        dueDate,
        amount: parseFloat(amount),
        status: 'pending'
      },
      include: {
        property: { select: { id: true, name: true, buildingName: true } }
      }
    });

    return NextResponse.json(tax, { status: 201 });
  } catch (error) {
    console.error('POST /api/rentals/taxes error:', error);
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      return createErrorResponse('NOT_FOUND', '產品不存在', 404);
    }
    return NextResponse.json(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '產品不存在', 404);
    }

    const isInStock = data.isInStock === true || data.isInStock === 'true' || data.isInStock === '是';

    if (isInStock && !data.warehouseLocation) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '列入庫存時必須填寫倉庫位置', 400);
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        code: data.code ?? existing.code,
        name: data.name ?? existing.name,
        category: data.category ?? existing.category,
        unit: data.unit ?? existing.unit,
        costPrice: data.costPrice !== undefined ? parseFloat(data.costPrice) : existing.costPrice,
        salesPrice: data.salesPrice !== undefined ? parseFloat(data.salesPrice) : existing.salesPrice,
        isInStock,
        warehouseLocation: isInStock ? (data.warehouseLocation || null) : null,
        accountingSubject: data.accountingSubject ?? existing.accountingSubject,
        supplierId: data.supplierId ? parseInt(data.supplierId) : null
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '產品不存在', 404);
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ message: '產品已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}

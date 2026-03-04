import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');

    const where = keyword
      ? {
          OR: [
            { code: { contains: keyword } },
            { name: { contains: keyword } }
          ]
        }
      : {};

    const products = await prisma.product.findMany({
      where,
      orderBy: { id: 'asc' }
    });

    return NextResponse.json(products);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    const data = await request.json();

    if (!data.code || !data.name || !data.costPrice || !data.salesPrice) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }

    const existing = await prisma.product.findUnique({ where: { code: data.code } });
    if (existing) {
      return createErrorResponse('PRODUCT_CODE_DUPLICATE', '產品代碼已存在', 409);
    }

    const isInStock = data.isInStock === true || data.isInStock === 'true' || data.isInStock === '是';

    if (isInStock && !data.warehouseLocation) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '列入庫存時必須填寫倉庫位置', 400);
    }

    const newProduct = await prisma.product.create({
      data: {
        code: data.code,
        name: data.name,
        category: data.category || '',
        unit: data.unit || '',
        costPrice: parseFloat(data.costPrice),
        salesPrice: parseFloat(data.salesPrice),
        isInStock,
        warehouseLocation: isInStock ? (data.warehouseLocation || null) : null,
        accountingSubject: data.accountingSubject || '',
        supplierId: data.supplierId ? parseInt(data.supplierId) : null
      }
    });

    return NextResponse.json(newProduct, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

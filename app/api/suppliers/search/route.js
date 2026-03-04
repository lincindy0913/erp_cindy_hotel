import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';

    let where = {};

    // Build search condition
    if (q.trim()) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { taxId: { contains: q, mode: 'insensitive' } }
      ];
    }

    // Try to filter by isActive, handle gracefully if field doesn't exist
    try {
      const suppliers = await prisma.supplier.findMany({
        where: { ...where, isActive: true },
        select: {
          id: true,
          name: true,
          taxId: true,
          paymentTerms: true
        },
        orderBy: { name: 'asc' },
        take: 20
      });

      return NextResponse.json(suppliers);
    } catch (innerError) {
      // If isActive field doesn't exist, query without it
      if (innerError.code === 'P2009' || innerError.message?.includes('isActive') || innerError.message?.includes('is_active')) {
        const suppliers = await prisma.supplier.findMany({
          where,
          select: {
            id: true,
            name: true,
            taxId: true,
            paymentTerms: true
          },
          orderBy: { name: 'asc' },
          take: 20
        });

        return NextResponse.json(suppliers);
      }
      throw innerError;
    }
  } catch (error) {
    console.error('搜尋廠商錯誤:', error);
    return handleApiError(error);
  }
}

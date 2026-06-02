import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';

    let where = {};

    // Build search condition
    if (q.trim()) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } }
      ];
    }

    const products = await prisma.product.findMany({
      where: { ...where, isActive: true },
      select: { id: true, name: true, code: true, unit: true, costPrice: true },
      orderBy: { name: 'asc' },
      take: 20,
    });

    return NextResponse.json(products);
  } catch (error) {
    return handleApiError(error);
  }
}

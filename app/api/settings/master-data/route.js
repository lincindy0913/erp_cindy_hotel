import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET: fetch master data summary (warehouses, departments, accounting subjects)
export async function GET() {
  try {
    const [warehouses, accountingSubjects] = await Promise.all([
      prisma.warehouse.findMany({
        where: { isActive: true },
        include: { departments: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.accountingSubject.findMany({
        where: { isActive: true },
        orderBy: [{ code: 'asc' }],
      }).catch(() => []),
    ]);

    return NextResponse.json({ warehouses, accountingSubjects });
  } catch (error) {
    console.error('查詢主資料錯誤:', error);
    return handleApiError(error);
  }
}

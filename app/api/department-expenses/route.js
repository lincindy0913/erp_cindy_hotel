import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    const where = {};
    if (year) where.year = parseInt(year);
    if (month) where.month = parseInt(month);

    const expenses = await prisma.departmentExpense.findMany({
      where,
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { department: 'asc' }
      ]
    });

    const result = expenses.map(e => ({
      id: e.id,
      year: e.year,
      month: e.month,
      department: e.department,
      category: e.category,
      tax: Number(e.tax),
      totalAmount: Number(e.totalAmount)
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

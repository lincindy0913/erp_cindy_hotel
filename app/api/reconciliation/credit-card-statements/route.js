import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// spec17 v3: Credit card statement management
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account');
    const month = searchParams.get('month'); // YYYY-MM format

    const where = {};
    if (accountId) where.accountId = parseInt(accountId);
    if (month) where.statementMonth = month;

    const statements = await prisma.creditCardStatement.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, warehouse: true } },
      },
      orderBy: [{ statementMonth: 'desc' }, { id: 'desc' }],
    });

    return NextResponse.json(statements.map(s => ({
      ...s,
      totalAmount: Number(s.totalAmount || 0),
      paidAmount: Number(s.paidAmount || 0),
      remainingAmount: Number(s.totalAmount || 0) - Number(s.paidAmount || 0),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.accountId || !data.statementMonth || !data.totalAmount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '帳戶、帳單月份、帳單金額為必填', 400);
    }

    // Check account exists and is credit card type
    const account = await prisma.cashAccount.findUnique({
      where: { id: parseInt(data.accountId) },
    });
    if (!account) {
      return createErrorResponse('NOT_FOUND', '找不到指定帳戶', 404);
    }

    const statement = await prisma.creditCardStatement.create({
      data: {
        accountId: parseInt(data.accountId),
        statementMonth: data.statementMonth,
        statementDate: data.statementDate || null,
        dueDate: data.dueDate || null,
        totalAmount: parseFloat(data.totalAmount),
        paidAmount: 0,
        minimumPayment: data.minimumPayment ? parseFloat(data.minimumPayment) : null,
        status: 'pending',
        chargeCount: data.chargeCount || 0,
        matchedCount: 0,
        note: data.note || null,
      },
      include: {
        account: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      ...statement,
      totalAmount: Number(statement.totalAmount),
      paidAmount: Number(statement.paidAmount),
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

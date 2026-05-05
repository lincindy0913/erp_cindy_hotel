import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
    if (!auth.ok) return auth.response;

    const where = {};
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    const accounts = await prisma.cashAccount.findMany({
      where,
      orderBy: [{ warehouse: 'asc' }, { type: 'asc' }, { name: 'asc' }],
      take: 500,
    });

    const result = accounts.map(a => ({
      ...a,
      openingBalance: Number(a.openingBalance),
      currentBalance: Number(a.currentBalance),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    const auth = await requireAnyPermission([PERMISSIONS.CASHFLOW_CREATE, PERMISSIONS.SETTINGS_EDIT]);
    if (!auth.ok) return auth.response;

    const data = await request.json();

    if (!data.name || !data.type) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '帳戶名稱、類型為必填', 400);
    }

    const openingBalance = parseFloat(data.openingBalance) || 0;

    // 如果有 accountCode，檢查是否重複
    if (data.accountCode) {
      const existing = await prisma.cashAccount.findUnique({ where: { accountCode: data.accountCode } });
      if (existing) {
        return createErrorResponse('CONFLICT_UNIQUE', `帳戶序號 ${data.accountCode} 已存在`, 409);
      }
    }

    const account = await prisma.cashAccount.create({
      data: {
        accountCode: data.accountCode || null,
        name: data.name.trim(),
        type: data.type,
        warehouse: data.warehouse || null,
        openingBalance,
        currentBalance: openingBalance,
        isActive: true,
        note: data.note || null
      }
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.CASH_ACCOUNT_CREATE,
      targetModule: 'cash-accounts',
      targetRecordId: account.id,
      afterState: { name: account.name, type: account.type, warehouse: account.warehouse },
    });

    return NextResponse.json({
      ...account,
      openingBalance: Number(account.openingBalance),
      currentBalance: Number(account.currentBalance),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { recalcBalance } from '@/lib/recalc-balance';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.cashAccount.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '帳戶不存在', 404);
    }

    // If opening balance is being changed, return transaction count as warning info
    if (data.openingBalance !== undefined && !data.confirmOpeningBalanceChange) {
      const newOpening = parseFloat(data.openingBalance);
      if (newOpening !== Number(existing.openingBalance)) {
        const txCount = await prisma.cashTransaction.count({ where: { accountId: id } });
        if (txCount > 0) {
          return NextResponse.json({
            warning: true,
            message: `此帳戶有 ${txCount} 筆交易紀錄，修改期初餘額將重新計算目前餘額。`,
            txCount,
            oldBalance: Number(existing.openingBalance),
            newBalance: newOpening,
          });
        }
      }
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.type !== undefined) updateData.type = data.type;
    if (data.warehouse !== undefined) updateData.warehouse = data.warehouse;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.openingBalance !== undefined) {
      updateData.openingBalance = parseFloat(data.openingBalance);
    }

    const account = await prisma.$transaction(async (tx) => {
      const updated = await tx.cashAccount.update({
        where: { id },
        data: updateData,
      });

      // If opening balance changed, fully recalculate current balance
      if (data.openingBalance !== undefined) {
        await recalcBalance(tx, id);
        return tx.cashAccount.findUnique({ where: { id } });
      }
      return updated;
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.CASH_ACCOUNT_UPDATE,
      targetModule: 'cash-accounts',
      targetRecordId: id,
      beforeState: { name: existing.name, type: existing.type, openingBalance: Number(existing.openingBalance) },
      afterState: { name: account.name, type: account.type, openingBalance: Number(account.openingBalance) },
    });

    return NextResponse.json({
      ...account,
      openingBalance: Number(account.openingBalance),
      currentBalance: Number(account.currentBalance),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);

    const toDelete = await prisma.cashAccount.findUnique({ where: { id }, select: { name: true, type: true, warehouse: true } });

    const txCount = await prisma.cashTransaction.count({
      where: { OR: [{ accountId: id }, { transferAccountId: id }] }
    });

    if (txCount > 0) {
      return createErrorResponse('ACCOUNT_HAS_DEPENDENCIES', '此帳戶有交易紀錄，無法刪除。請先停用帳戶。', 400);
    }

    await prisma.cashAccount.delete({ where: { id } });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.CASH_ACCOUNT_DELETE,
      targetModule: 'cash-accounts',
      targetRecordId: id,
      beforeState: toDelete ? { name: toDelete.name, type: toDelete.type, warehouse: toDelete.warehouse } : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

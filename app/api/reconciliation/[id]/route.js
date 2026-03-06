import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: Get reconciliation with all associated bank statement lines
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = params;

    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: parseInt(id) },
      include: {
        account: {
          select: { id: true, name: true, warehouse: true, type: true, accountCode: true }
        },
        import: {
          include: {
            lines: {
              orderBy: [{ txDate: 'asc' }, { lineNo: 'asc' }]
            },
            bankFormat: {
              select: { id: true, bankName: true }
            }
          }
        }
      }
    });

    if (!reconciliation) {
      return createErrorResponse('NOT_FOUND', '對帳記錄不存在', 404);
    }

    // Also get all bank statement lines for this account/month (could be from multiple imports)
    const lines = await prisma.bankStatementLine.findMany({
      where: {
        accountId: reconciliation.accountId,
        reconciliationId: reconciliation.id
      },
      orderBy: [{ txDate: 'asc' }, { lineNo: 'asc' }]
    });

    // Get system transactions for this account/month
    const monthStart = `${reconciliation.statementYear}-${String(reconciliation.statementMonth).padStart(2, '0')}-01`;
    const nextMonth = reconciliation.statementMonth === 12 ? 1 : reconciliation.statementMonth + 1;
    const nextYear = reconciliation.statementMonth === 12 ? reconciliation.statementYear + 1 : reconciliation.statementYear;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const systemTransactions = await prisma.cashTransaction.findMany({
      where: {
        accountId: reconciliation.accountId,
        transactionDate: { gte: monthStart, lt: monthEnd }
      },
      include: {
        category: { select: { id: true, name: true } }
      },
      orderBy: { transactionDate: 'asc' }
    });

    const result = {
      ...reconciliation,
      openingBalance: Number(reconciliation.openingBalance),
      closingBalanceSystem: Number(reconciliation.closingBalanceSystem),
      closingBalanceBank: Number(reconciliation.closingBalanceBank),
      difference: Number(reconciliation.difference),
      createdAt: reconciliation.createdAt.toISOString(),
      updatedAt: reconciliation.updatedAt.toISOString(),
      confirmedAt: reconciliation.confirmedAt ? reconciliation.confirmedAt.toISOString() : null,
      bankLines: lines.map(l => ({
        ...l,
        debitAmount: Number(l.debitAmount),
        creditAmount: Number(l.creditAmount),
        netAmount: Number(l.netAmount),
        runningBalance: l.runningBalance ? Number(l.runningBalance) : null
      })),
      systemTransactions: systemTransactions.map(t => ({
        ...t,
        amount: Number(t.amount),
        fee: Number(t.fee),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString()
      }))
    };

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT: Update reconciliation
export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = params;
    const data = await request.json();
    const { action } = data;

    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: parseInt(id) }
    });

    if (!reconciliation) {
      return createErrorResponse('NOT_FOUND', '對帳記錄不存在', 404);
    }

    if (action === 'update_bank_balance') {
      const closingBalanceBank = parseFloat(data.closingBalanceBank);
      if (isNaN(closingBalanceBank)) {
        return createErrorResponse('VALIDATION_FAILED', '銀行餘額必須為數字', 400);
      }

      const difference = Number(reconciliation.closingBalanceSystem) - closingBalanceBank;

      const updated = await prisma.bankReconciliation.update({
        where: { id: parseInt(id) },
        data: {
          closingBalanceBank,
          difference,
          note: data.note || reconciliation.note
        },
        include: {
          account: {
            select: { id: true, name: true, warehouse: true, type: true, accountCode: true }
          }
        }
      });

      return NextResponse.json({
        ...updated,
        openingBalance: Number(updated.openingBalance),
        closingBalanceSystem: Number(updated.closingBalanceSystem),
        closingBalanceBank: Number(updated.closingBalanceBank),
        difference: Number(updated.difference),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        confirmedAt: updated.confirmedAt ? updated.confirmedAt.toISOString() : null
      });
    }

    if (action === 'confirm') {
      if (reconciliation.status === 'confirmed') {
        return createErrorResponse('VALIDATION_FAILED', '此對帳記錄已確認', 400);
      }

      const diff = Number(reconciliation.difference);
      if (diff !== 0 && !data.differenceExplained) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '差異金額不為零時，需填寫差異說明', 400);
      }

      const updated = await prisma.bankReconciliation.update({
        where: { id: parseInt(id) },
        data: {
          status: 'confirmed',
          confirmedBy: data.confirmedBy || '系統',
          confirmedAt: new Date(),
          differenceExplained: data.differenceExplained || null,
          note: data.note || reconciliation.note
        },
        include: {
          account: {
            select: { id: true, name: true, warehouse: true, type: true, accountCode: true }
          }
        }
      });

      return NextResponse.json({
        ...updated,
        openingBalance: Number(updated.openingBalance),
        closingBalanceSystem: Number(updated.closingBalanceSystem),
        closingBalanceBank: Number(updated.closingBalanceBank),
        difference: Number(updated.difference),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        confirmedAt: updated.confirmedAt ? updated.confirmedAt.toISOString() : null
      });
    }

    return createErrorResponse('VALIDATION_FAILED', '無效的操作', 400);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: Only if status='draft'
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = params;

    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: parseInt(id) }
    });

    if (!reconciliation) {
      return createErrorResponse('NOT_FOUND', '對帳記錄不存在', 404);
    }

    if (reconciliation.status !== 'draft') {
      return createErrorResponse('VALIDATION_FAILED', '只能刪除草稿狀態的對帳記錄', 400);
    }

    // Clear reconciliationId from bank statement lines
    await prisma.bankStatementLine.updateMany({
      where: { reconciliationId: parseInt(id) },
      data: { reconciliationId: null, matchStatus: 'unprocessed', matchedTransactionId: null, matchedBy: null }
    });

    await prisma.bankReconciliation.delete({
      where: { id: parseInt(id) }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

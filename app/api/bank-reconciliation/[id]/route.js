import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 取得單一調節表（含系統交易列表）
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);
    const stmt = await prisma.bankStatement.findUnique({
      where: { id },
      include: { lines: { orderBy: [{ txDate: 'asc' }, { id: 'asc' }] } },
    });
    if (!stmt) return createErrorResponse('NOT_FOUND', '找不到調節表', 404);

    const [y, m]    = stmt.yearMonth.split('-').map(Number);
    const startDate = `${stmt.yearMonth}-01`;
    const endDate   = `${stmt.yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    // 系統本期交易
    const sysTxs = await prisma.cashTransaction.findMany({
      where: {
        accountId: stmt.accountId,
        transactionDate: { gte: startDate, lte: endDate },
      },
      select: {
        id: true, transactionNo: true, transactionDate: true,
        type: true, amount: true, description: true, sourceType: true,
      },
      orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
    });

    // 計算系統期末餘額
    const sysPeriodSum = sysTxs.reduce((s, t) => {
      return s + (t.type === '收入' ? Number(t.amount) : -Number(t.amount));
    }, 0);
    const closingSystemBalance = Number(stmt.openingBalance) + sysPeriodSum;

    // 每筆存摺明細對應的 sys tx
    const matchedTxIds = new Set(stmt.lines.filter(l => l.matchedTxId).map(l => l.matchedTxId));

    return NextResponse.json({
      ...stmt,
      openingBalance:     Number(stmt.openingBalance),
      openingBankBalance: stmt.openingBankBalance != null ? Number(stmt.openingBankBalance) : null,
      closingBankBalance: stmt.closingBankBalance != null ? Number(stmt.closingBankBalance) : null,
      closingSystemBalance,
      createdAt:   stmt.createdAt.toISOString(),
      updatedAt:   stmt.updatedAt.toISOString(),
      reconciledAt: stmt.reconciledAt ? stmt.reconciledAt.toISOString() : null,
      lines: stmt.lines.map(l => ({
        ...l,
        creditAmount:   Number(l.creditAmount),
        debitAmount:    Number(l.debitAmount),
        runningBalance: l.runningBalance != null ? Number(l.runningBalance) : null,
        createdAt:      l.createdAt.toISOString(),
      })),
      systemTransactions: sysTxs.map(t => ({
        ...t,
        amount: Number(t.amount),
        isMatched: matchedTxIds.has(t.id),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH: 更新調節表（期末餘額、狀態）
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt((await params).id);
    const data = await request.json();
    const existing = await prisma.bankStatement.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到調節表', 404);

    // 自動判斷狀態
    let status = data.status ?? existing.status;
    if (data.closingBankBalance != null && existing.closingBankBalance != null) {
      // 計算系統期末並比較
    }

    const updated = await prisma.bankStatement.update({
      where: { id },
      data: {
        openingBankBalance: data.openingBankBalance != null ? Number(data.openingBankBalance) : existing.openingBankBalance,
        closingBankBalance: data.closingBankBalance != null ? Number(data.closingBankBalance) : existing.closingBankBalance,
        status,
        note: data.note ?? existing.note,
        reconciledAt: status === '已平衡' && existing.status !== '已平衡' ? new Date() : existing.reconciledAt,
        reconciledBy: status === '已平衡' && existing.status !== '已平衡' ? (auth.user?.name || auth.user?.email || null) : existing.reconciledBy,
      },
    });

    return NextResponse.json({
      ...updated,
      openingBalance:     Number(updated.openingBalance),
      openingBankBalance: updated.openingBankBalance != null ? Number(updated.openingBankBalance) : null,
      closingBankBalance: updated.closingBankBalance != null ? Number(updated.closingBankBalance) : null,
      createdAt:   updated.createdAt.toISOString(),
      updatedAt:   updated.updatedAt.toISOString(),
      reconciledAt: updated.reconciledAt ? updated.reconciledAt.toISOString() : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

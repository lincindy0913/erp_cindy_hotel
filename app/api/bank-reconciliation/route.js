import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { calcBalanceDelta } from '@/lib/calc-balance-delta';
import { RECON_STATUS } from '@/lib/recon-statuses';

export const dynamic = 'force-dynamic';

function serialize(s) {
  return {
    ...s,
    openingBalance:     Number(s.openingBalance),
    openingBankBalance: s.openingBankBalance != null ? Number(s.openingBankBalance) : null,
    closingBankBalance: s.closingBankBalance != null ? Number(s.closingBankBalance) : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    reconciledAt: s.reconciledAt ? s.reconciledAt.toISOString() : null,
  };
}

// GET: 列出調節表（可依帳戶、月份篩選）
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const yearMonth = searchParams.get('yearMonth');

    const where = {};
    if (accountId) where.accountId = parseInt(accountId);
    if (yearMonth) where.yearMonth = yearMonth;

    const statements = await prisma.bankStatement.findMany({
      where,
      include: {
        _count: { select: { lines: true } },
      },
      orderBy: [{ yearMonth: 'desc' }, { accountId: 'asc' }],
    });

    // 附帶帳戶資訊
    const accountIds = [...new Set(statements.map(s => s.accountId))];
    const accounts   = accountIds.length
      ? await prisma.cashAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true, type: true } })
      : [];
    const accMap = Object.fromEntries(accounts.map(a => [a.id, a]));

    return NextResponse.json(statements.map(s => ({
      ...serialize(s),
      account:    accMap[s.accountId] || null,
      lineCount:  s._count.lines,
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

// @deprecated — 舊版月調節表系統。新帳戶請使用 /api/reconciliation/（BankReconciliation）。
// POST: 建立/取得調節表（冪等：同 accountId+yearMonth 若已存在則返回現有）
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const { accountId, yearMonth, allowLegacy } = data;
    if (!accountId || !yearMonth) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供帳戶 ID 和月份', 400);
    }

    // 查詢帳戶與系統期初餘額（月初前一日餘額）
    const account = await prisma.cashAccount.findUnique({ where: { id: parseInt(accountId) } });
    if (!account) return createErrorResponse('NOT_FOUND', '找不到帳戶', 404);

    const [y, m]  = yearMonth.split('-').map(Number);
    const startDate = `${yearMonth}-01`;

    // 跨系統衝突檢查：若新版 BankReconciliation 已有同帳戶同月份記錄，阻擋建立以避免餘額不一致
    if (!allowLegacy) {
      const newSystemRecon = await prisma.bankReconciliation.findFirst({
        where: { accountId: parseInt(accountId), statementYear: y, statementMonth: m },
        select: { id: true, reconciliationNo: true },
      });
      if (newSystemRecon) {
        return createErrorResponse(
          'CONFLICT_DUPLICATE',
          `此帳戶 ${yearMonth} 已在新版銀行對帳（${newSystemRecon.reconciliationNo}）中建立。請改用「銀行對帳（逐筆匯入）」頁面，或傳入 allowLegacy: true 強制在舊系統建立。`,
          409,
          { newReconId: newSystemRecon.id, newReconNo: newSystemRecon.reconciliationNo }
        );
      }
    }

    // 取期初餘額：startDate 前所有交易，依 type 決定正負（amount 永遠正數）
    const beforeTxs = await prisma.cashTransaction.findMany({
      where: { accountId: parseInt(accountId), transactionDate: { lt: startDate } },
      select: { type: true, amount: true, fee: true, hasFee: true },
    });
    const openingBalance = Number(account.openingBalance) + calcBalanceDelta(beforeTxs);

    const existing = await prisma.bankStatement.findUnique({
      where: { accountId_yearMonth: { accountId: parseInt(accountId), yearMonth } },
    });

    if (existing) {
      return NextResponse.json({ ...serialize(existing), alreadyExisted: true });
    }

    const stmt = await prisma.bankStatement.create({
      data: {
        accountId:      parseInt(accountId),
        yearMonth,
        openingBalance,
        openingBankBalance: data.openingBankBalance != null ? Number(data.openingBankBalance) : null,
        closingBankBalance: data.closingBankBalance != null ? Number(data.closingBankBalance) : null,
        status: RECON_STATUS.IN_PROGRESS,
        note: data.note || null,
      },
    });

    return NextResponse.json(serialize(stmt), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET  /api/bnb/deposit-match?month=2026-03&accountId=5
 *   — 回傳該月 BNB 訂金清單 + 指定帳戶存簿入帳明細（信用/入帳），供核對
 *
 * POST /api/bnb/deposit-match
 *   body: { bnbId, bankLineId }
 *   — 配對一筆 BNB 訂金 ↔ 存簿明細行
 *
 * DELETE /api/bnb/deposit-match?bnbId=123
 *   — 解除配對
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ── GET ──────────────────────────────────────────────────────────────
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month     = searchParams.get('month');     // YYYY-MM
    const accountId = searchParams.get('accountId'); // CashAccount id
    const warehouse = searchParams.get('warehouse') || '';

    if (!month) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 month 參數', 400);

    // ── 1. BNB 訂金記錄（payDeposit > 0，不含已刪除）──────────────
    const bnbWhere = {
      importMonth: month,
      payDeposit:  { gt: 0 },
      status:      { not: '已刪除' },
    };
    if (warehouse) bnbWhere.warehouse = warehouse;

    const bnbRecords = await prisma.bnbBookingRecord.findMany({
      where: bnbWhere,
      select: {
        id: true, guestName: true, checkInDate: true, checkOutDate: true,
        roomCharge: true, payDeposit: true, source: true, status: true,
        depositBankLineId: true, depositMatchedAt: true, depositMatchedBy: true,
        note: true,
      },
      orderBy: { checkInDate: 'asc' },
    });

    // ── 2. 銀行存簿入帳明細（creditAmount > 0，該月）──────────────
    // 日期範圍：月份首日 ～ 月份末日
    const dateFrom = `${month}-01`;
    const dateTo   = `${month}-31`;

    const bankLineWhere = {
      txDate:       { gte: dateFrom, lte: dateTo },
      creditAmount: { gt: 0 },
    };
    if (accountId) bankLineWhere.accountId = parseInt(accountId);

    const bankLines = await prisma.bankStatementLine.findMany({
      where: bankLineWhere,
      select: {
        id: true, txDate: true, description: true,
        creditAmount: true, referenceNo: true, runningBalance: true,
        matchStatus: true, accountId: true,
      },
      orderBy: { txDate: 'asc' },
    });

    // ── 3. 已被本月 BNB 記錄使用的 bankLineId Set ─────────────────
    const usedLineIds = new Set(
      bnbRecords.filter(r => r.depositBankLineId).map(r => r.depositBankLineId)
    );

    // ── 4. 自動建議：金額完全相符的配對 ──────────────────────────
    // 對每筆未配對的 BNB，找金額相同 且 日期在 checkInDate ±7 天 的存簿行
    const unmatchedBnb   = bnbRecords.filter(r => !r.depositBankLineId);
    const unmatchedLines = bankLines.filter(l => !usedLineIds.has(l.id));

    const suggestions = [];
    for (const bnb of unmatchedBnb) {
      const depositAmt = Number(bnb.payDeposit);
      const checkIn    = new Date(bnb.checkInDate);
      for (const line of unmatchedLines) {
        if (Number(line.creditAmount) !== depositAmt) continue;
        const lineDt = new Date(line.txDate);
        const diffDays = Math.abs((lineDt - checkIn) / 86400000);
        if (diffDays <= 7) {
          suggestions.push({ bnbId: bnb.id, bankLineId: line.id, diffDays });
          break; // 每筆 BNB 只取第一個最近建議
        }
      }
    }

    // ── 5. 摘要統計 ────────────────────────────────────────────────
    const totalBnbDeposit  = bnbRecords.reduce((s, r) => s + Number(r.payDeposit), 0);
    const totalBankCredit  = bankLines.reduce((s, l) => s + Number(l.creditAmount), 0);
    const matchedCount     = bnbRecords.filter(r => r.depositBankLineId).length;

    return NextResponse.json({
      month,
      summary: {
        totalBnbDeposit,
        totalBankCredit,
        matchedCount,
        unmatchedBnbCount:  unmatchedBnb.length,
        unmatchedLineCount: unmatchedLines.length,
        diff: totalBnbDeposit - totalBankCredit,
      },
      bnbRecords: bnbRecords.map(r => ({
        ...r,
        payDeposit: Number(r.payDeposit),
        roomCharge: Number(r.roomCharge),
      })),
      bankLines: bankLines.map(l => ({
        ...l,
        creditAmount: Number(l.creditAmount),
        runningBalance: l.runningBalance ? Number(l.runningBalance) : null,
        isUsed: usedLineIds.has(l.id),
      })),
      suggestions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── POST ─────────────────────────────────────────────────────────────
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT, PERMISSIONS.BNB_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const session  = await getServerSession(authOptions);
    const userName = session?.user?.name || session?.user?.email || 'system';

    const { bnbId, bankLineId } = await request.json();
    if (!bnbId || !bankLineId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 bnbId 或 bankLineId', 400);
    }

    // 確認 bankLine 存在
    const line = await prisma.bankStatementLine.findUnique({ where: { id: parseInt(bankLineId) } });
    if (!line) return createErrorResponse('NOT_FOUND', '找不到存簿明細行', 404);

    // 確認此 bankLine 未被其他 BNB 佔用
    const existing = await prisma.bnbBookingRecord.findFirst({
      where: {
        depositBankLineId: parseInt(bankLineId),
        id: { not: parseInt(bnbId) },
      },
    });
    if (existing) {
      return createErrorResponse('CONFLICT', `此存簿明細已被「${existing.guestName}」配對使用`, 409);
    }

    const updated = await prisma.bnbBookingRecord.update({
      where: { id: parseInt(bnbId) },
      data: {
        depositBankLineId: parseInt(bankLineId),
        depositMatchedAt:  new Date(),
        depositMatchedBy:  userName,
      },
      select: {
        id: true, guestName: true, payDeposit: true,
        depositBankLineId: true, depositMatchedAt: true, depositMatchedBy: true,
      },
    });

    return NextResponse.json({ ...updated, payDeposit: Number(updated.payDeposit) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── DELETE ────────────────────────────────────────────────────────────
export async function DELETE(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const bnbId = parseInt(searchParams.get('bnbId'));
    if (!bnbId) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 bnbId', 400);

    await prisma.bnbBookingRecord.update({
      where: { id: bnbId },
      data: {
        depositBankLineId: null,
        depositMatchedAt:  null,
        depositMatchedBy:  null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

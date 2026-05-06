/**
 * GET  /api/bnb/deposit-match?month=2026-03&accountId=5&paymentType=deposit
 *   paymentType: deposit | transfer | card | cash（預設 deposit）
 *
 * POST /api/bnb/deposit-match
 *   body: { bnbId, bankLineId, paymentType? }
 *
 * DELETE /api/bnb/deposit-match?bnbId=123&paymentType=deposit
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { assertBnbMonthOpen } from '@/lib/bnb-lock';

export const dynamic = 'force-dynamic';

// ── 付款類型欄位對照表 ──────────────────────────────────────────────
const PAY_TYPE_CONFIG = {
  deposit: {
    amountField:   'payDeposit',
    dateField:     'depositDate',
    last5Field:    'depositLast5',
    bankLineField: 'depositBankLineId',
    matchedAtField:'depositMatchedAt',
    matchedByField:'depositMatchedBy',
    label:         '訂金匯款',
    bankDateField: 'txDate',  // 比對用的銀行日期欄位
    searchWindowDays: 14,
  },
  transfer: {
    amountField:   'payTransfer',
    dateField:     'transferDate',
    last5Field:    'transferLast5',
    bankLineField: 'transferBankLineId',
    matchedAtField:'transferMatchedAt',
    matchedByField:'transferMatchedBy',
    label:         '當天匯款',
    bankDateField: 'txDate',
    searchWindowDays: 7,
  },
  card: {
    amountField:   'payCard',
    dateField:     'cardSettlementDate',
    last5Field:    null,
    bankLineField: 'cardBankLineId',
    matchedAtField:'cardMatchedAt',
    matchedByField:'cardMatchedBy',
    label:         '刷卡',
    bankDateField: 'txDate',
    searchWindowDays: 5,
  },
  cash: {
    amountField:   'payCash',
    dateField:     'cashDepositDate',
    last5Field:    null,
    bankLineField: 'cashBankLineId',
    matchedAtField:'cashMatchedAt',
    matchedByField:'cashMatchedBy',
    label:         '現金存款',
    bankDateField: 'txDate',
    searchWindowDays: 7,
  },
};

function getConfig(paymentType) {
  return PAY_TYPE_CONFIG[paymentType] || PAY_TYPE_CONFIG.deposit;
}

// ── GET ──────────────────────────────────────────────────────────────
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month       = searchParams.get('month');
    const accountId   = searchParams.get('accountId');
    const warehouse   = searchParams.get('warehouse') || '';
    const paymentType = searchParams.get('paymentType') || 'deposit';

    if (!month) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 month 參數', 400);

    const cfg = getConfig(paymentType);

    // ── 整體核對進度（paymentType = 'all'）─────────────────────
    if (paymentType === 'all') {
      const where = { importMonth: month, status: { not: '已刪除' } };
      if (warehouse) where.warehouse = warehouse;
      const records = await prisma.bnbBookingRecord.findMany({
        where,
        select: {
          payDeposit:        true, depositBankLineId:  true,
          payTransfer:       true, transferBankLineId: true,
          payCard:           true, cardBankLineId:     true,
          payCash:           true, cashBankLineId:     true, cashDestination: true,
        },
      });

      const summary = {
        deposit:  { label: '訂金匯款', total: 0, matched: 0, unmatched: 0, amount: 0 },
        transfer: { label: '當天匯款', total: 0, matched: 0, unmatched: 0, amount: 0 },
        card:     { label: '刷卡',     total: 0, matched: 0, unmatched: 0, amount: 0 },
        cash:     { label: '現金存款', total: 0, matched: 0, unmatched: 0, amount: 0 },
      };

      for (const r of records) {
        if (Number(r.payDeposit)  > 0) {
          summary.deposit.total++;  summary.deposit.amount  += Number(r.payDeposit);
          if (r.depositBankLineId)  summary.deposit.matched++;  else summary.deposit.unmatched++;
        }
        if (Number(r.payTransfer) > 0) {
          summary.transfer.total++; summary.transfer.amount += Number(r.payTransfer);
          if (r.transferBankLineId) summary.transfer.matched++; else summary.transfer.unmatched++;
        }
        if (Number(r.payCard)     > 0) {
          summary.card.total++;     summary.card.amount     += Number(r.payCard);
          if (r.cardBankLineId)     summary.card.matched++;     else summary.card.unmatched++;
        }
        if (Number(r.payCash)     > 0 && r.cashDestination === '存帳') {
          summary.cash.total++;     summary.cash.amount     += Number(r.payCash);
          if (r.cashBankLineId)     summary.cash.matched++;     else summary.cash.unmatched++;
        }
      }

      return NextResponse.json({ month, summary: Object.values(summary) });
    }

    // ── 1. BNB 收款記錄 ─────────────────────────────────────────
    const amountFilter = { [cfg.amountField]: { gt: 0 } };
    if (paymentType === 'cash') amountFilter.cashDestination = '存帳';

    const bnbWhere = {
      importMonth: month,
      status:      { not: '已刪除' },
      ...amountFilter,
    };
    if (warehouse) bnbWhere.warehouse = warehouse;

    const selectFields = {
      id: true, guestName: true, checkInDate: true, checkOutDate: true,
      roomCharge: true, source: true, status: true, note: true,
      [cfg.amountField]:   true,
      [cfg.dateField]:     true,
      [cfg.bankLineField]: true,
      [cfg.matchedAtField]:true,
      [cfg.matchedByField]:true,
    };
    if (cfg.last5Field) selectFields[cfg.last5Field] = true;
    if (paymentType === 'cash') selectFields.cashDestination = true;

    const bnbRecords = await prisma.bnbBookingRecord.findMany({
      where:   bnbWhere,
      select:  selectFields,
      orderBy: { checkInDate: 'asc' },
    });

    // ── 2. 銀行存簿入帳明細 ───────────────────────────────────────
    const dateFrom = `${month}-01`;
    const [y, m_] = month.split('-').map(Number);
    const lastDay  = new Date(y, m_, 0).getDate();
    const dateTo   = `${month}-${String(lastDay).padStart(2, '0')}`;

    const bankLineWhere = {
      txDate:       { gte: dateFrom, lte: dateTo },
      creditAmount: { gt: 0 },
    };
    if (accountId) bankLineWhere.accountId = parseInt(accountId);

    const bankLines = await prisma.bankStatementLine.findMany({
      where:   bankLineWhere,
      select:  { id: true, txDate: true, description: true, creditAmount: true, referenceNo: true, runningBalance: true },
      orderBy: { txDate: 'asc' },
    });

    // ── 3. 已用 bankLineId Set ───────────────────────────────────
    const usedLineIds = new Set(
      bnbRecords.filter(r => r[cfg.bankLineField]).map(r => r[cfg.bankLineField])
    );

    // ── 4. 自動配對建議 ──────────────────────────────────────────
    const unmatchedBnb   = bnbRecords.filter(r => !r[cfg.bankLineField]);
    const unmatchedLines = bankLines.filter(l => !usedLineIds.has(l.id));
    const usedSuggLines  = new Set();
    const suggestions    = [];

    for (const bnb of unmatchedBnb) {
      const amt    = Number(bnb[cfg.amountField]);
      const refDate = bnb[cfg.dateField]
        ? new Date(bnb[cfg.dateField])
        : new Date(bnb.checkInDate);
      const last5  = cfg.last5Field ? (bnb[cfg.last5Field] || '') : '';
      let bestMatch = null; let bestScore = -1;

      for (const line of unmatchedLines) {
        if (usedSuggLines.has(line.id)) continue;
        if (Number(line.creditAmount) !== amt) continue;
        const diffDays = Math.abs((new Date(line.txDate) - refDate) / 86400000);
        if (diffDays > cfg.searchWindowDays) continue;
        let score = 0;
        if (last5 && line.description && line.description.includes(last5)) score += 10;
        if (bnb[cfg.dateField] && line.txDate === bnb[cfg.dateField]) score += 5;
        else if (diffDays <= 2) score += 3;
        else if (diffDays <= 5) score += 1;
        if (score > bestScore) { bestScore = score; bestMatch = { bnbId: bnb.id, bankLineId: line.id, diffDays: Math.round(diffDays), score }; }
      }
      if (bestMatch) { suggestions.push(bestMatch); usedSuggLines.add(bestMatch.bankLineId); }
    }

    // ── 5. 摘要統計 ────────────────────────────────────────────
    const totalBnbAmount  = bnbRecords.reduce((s, r) => s + Number(r[cfg.amountField]), 0);
    const totalBankCredit = bankLines.reduce((s, l) => s + Number(l.creditAmount), 0);
    const matchedCount    = bnbRecords.filter(r => r[cfg.bankLineField]).length;

    // 正規化欄位名稱（統一為 payAmount / dateField / last5 / bankLineId / matchedAt / matchedBy）
    const normalizedBnb = bnbRecords.map(r => ({
      id:          r.id,
      guestName:   r.guestName,
      checkInDate: r.checkInDate,
      checkOutDate:r.checkOutDate,
      roomCharge:  Number(r.roomCharge),
      source:      r.source,
      status:      r.status,
      note:        r.note,
      payAmount:   Number(r[cfg.amountField]),
      payDate:     r[cfg.dateField] || null,
      last5:       cfg.last5Field ? (r[cfg.last5Field] || null) : null,
      bankLineId:  r[cfg.bankLineField] || null,
      matchedAt:   r[cfg.matchedAtField] || null,
      matchedBy:   r[cfg.matchedByField] || null,
    }));

    return NextResponse.json({
      month,
      paymentType,
      label: cfg.label,
      summary: {
        totalBnbAmount,
        totalBankCredit,
        matchedCount,
        unmatchedBnbCount:  unmatchedBnb.length,
        unmatchedLineCount: unmatchedLines.length,
        diff: totalBnbAmount - totalBankCredit,
      },
      bnbRecords: normalizedBnb,
      bankLines:  bankLines.map(l => ({
        ...l,
        creditAmount:   Number(l.creditAmount),
        runningBalance: l.runningBalance ? Number(l.runningBalance) : null,
        isUsed:         usedLineIds.has(l.id),
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
    const session     = await getServerSession(authOptions);
    const userName    = session?.user?.name || session?.user?.email || 'system';
    const { bnbId, bankLineId, paymentType = 'deposit' } = await request.json();

    if (!bnbId || !bankLineId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 bnbId 或 bankLineId', 400);
    }

    const cfg = getConfig(paymentType);
    const bnbRec = await prisma.bnbBookingRecord.findUnique({
      where: { id: parseInt(bnbId) },
      select: { importMonth: true, warehouse: true },
    });
    if (bnbRec) await assertBnbMonthOpen(bnbRec.importMonth, bnbRec.warehouse);

    const line = await prisma.bankStatementLine.findUnique({ where: { id: parseInt(bankLineId) } });
    if (!line) return createErrorResponse('NOT_FOUND', '找不到存簿明細行', 404);

    // 確認此 bankLine 未被其他 BNB 的相同付款類型佔用
    const existing = await prisma.bnbBookingRecord.findFirst({
      where: {
        [cfg.bankLineField]: parseInt(bankLineId),
        id: { not: parseInt(bnbId) },
      },
    });
    if (existing) {
      return createErrorResponse('CONFLICT', `此存簿明細已被「${existing.guestName}」配對使用`, 409);
    }

    const updated = await prisma.bnbBookingRecord.update({
      where: { id: parseInt(bnbId) },
      data: {
        [cfg.bankLineField]: parseInt(bankLineId),
        [cfg.matchedAtField]: new Date(),
        [cfg.matchedByField]: userName,
      },
    });

    return NextResponse.json({ ok: true, id: updated.id });
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
    const bnbId      = parseInt(searchParams.get('bnbId'));
    const paymentType = searchParams.get('paymentType') || 'deposit';

    if (!bnbId) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 bnbId', 400);

    const cfg    = getConfig(paymentType);
    const bnbRec = await prisma.bnbBookingRecord.findUnique({
      where: { id: bnbId },
      select: { importMonth: true, warehouse: true },
    });
    if (bnbRec) await assertBnbMonthOpen(bnbRec.importMonth, bnbRec.warehouse);

    await prisma.bnbBookingRecord.update({
      where: { id: bnbId },
      data: {
        [cfg.bankLineField]:  null,
        [cfg.matchedAtField]: null,
        [cfg.matchedByField]: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

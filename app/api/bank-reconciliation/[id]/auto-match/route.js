import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { localDateStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

function datePlusDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

function dayDiff(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / 86400000);
}

// 從描述中抽取帳號末5碼（如 "**1234 5" 或 "末5碼:12345"）
function extractAtmTail(desc) {
  if (!desc) return null;
  const m = desc.match(/(\d{5})\s*$/) || desc.match(/[*\-](\d{5})/) || desc.match(/末.{0,3}:?\s*(\d{5})/);
  return m ? m[1] : null;
}

function confidenceScore(lineAmt, txAmt, lineDate, txDate, lineDesc, txDesc) {
  let score = 0;
  const amtDiff = Math.abs(txAmt - lineAmt);
  if (amtDiff === 0) score += 50;
  else if (amtDiff <= 1) score += 40;
  else if (amtDiff <= 10) score += 20;

  const dDiff = dayDiff(lineDate, txDate);
  if (dDiff === 0) score += 30;
  else if (dDiff <= 1) score += 20;
  else if (dDiff <= 3) score += 10;

  // ATM 末5碼比對
  const lineTail = extractAtmTail(lineDesc);
  const txTail   = extractAtmTail(txDesc);
  if (lineTail && txTail && lineTail === txTail) score += 20;

  return score;
}

// POST: 自動配對 — 按日期 + 金額比對存摺明細與系統交易（±3天 + note ATM末5碼）
export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt(params.id);
    const body = await request.json().catch(() => ({}));
    const minScore = body.minScore ?? 50; // 預設信心分 50 分以上才自動配對

    const stmt = await prisma.bankStatement.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!stmt) return Response.json({ error: { message: '找不到調節表' } }, { status: 404 });

    const [y, m] = stmt.yearMonth.split('-').map(Number);
    const monthStart = `${stmt.yearMonth}-01`;
    const monthEnd   = `${stmt.yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    // 擴展 ±3 天：往前/後多抓一點交易
    const fetchStart = datePlusDays(monthStart, -3);
    const fetchEnd   = datePlusDays(monthEnd, 3);

    // 取系統交易（含 description 用於 ATM 末5碼比對）
    const sysTxs = await prisma.cashTransaction.findMany({
      where: {
        accountId: stmt.accountId,
        transactionDate: { gte: fetchStart, lte: fetchEnd },
        status: { not: 'cc_pending' }, // 信用卡待撥款不列入銀行存摺配對
      },
      select: { id: true, transactionDate: true, type: true, amount: true, description: true },
    });

    // 已配對的系統交易 ID（不重複配對）
    const usedTxIds = new Set(
      stmt.lines.filter(l => l.matchedTxId).map(l => l.matchedTxId)
    );

    // 未配對的存摺明細
    const unmatched = stmt.lines.filter(l => l.matchStatus === '未配對');

    let autoMatched  = 0;
    let suggested    = 0;
    const suggestions = [];

    await prisma.$transaction(async (tx) => {
      for (const line of unmatched) {
        const lineAmt  = line.creditAmount > 0 ? Number(line.creditAmount) : -Number(line.debitAmount);
        const lineDate = line.txDate;

        // 計算每筆系統交易的信心分
        const candidates = sysTxs
          .filter(t => !usedTxIds.has(t.id))
          .map(t => {
            const txAmt = t.type === '收入' ? Number(t.amount) : -Number(t.amount);
            const dDiff = dayDiff(lineDate, t.transactionDate);
            if (dDiff > 3) return null;
            if (Math.abs(txAmt - lineAmt) > Math.max(10, Math.abs(lineAmt) * 0.01)) return null;
            const score = confidenceScore(lineAmt, txAmt, lineDate, t.transactionDate, line.description, t.description);
            return { tx: t, score };
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score);

        if (candidates.length === 0) continue;

        const best = candidates[0];

        if (best.score >= minScore) {
          // 自動確認配對
          await tx.bankReconLine.update({
            where: { id: line.id },
            data: { matchedTxId: best.tx.id, matchStatus: '已配對' },
          });
          usedTxIds.add(best.tx.id);
          autoMatched++;
        } else if (best.score >= 30) {
          // 信心不足，記為建議（前端可顯示供人工確認）
          suggestions.push({
            lineId: line.id,
            txId: best.tx.id,
            score: best.score,
            lineDate,
            lineAmt,
            txDate: best.tx.transactionDate,
            txAmt: best.tx.type === '收入' ? Number(best.tx.amount) : -Number(best.tx.amount),
            txDesc: best.tx.description,
          });
          suggested++;
        }
      }
    });

    const unmatchedAfter = unmatched.length - autoMatched;
    return NextResponse.json({
      success: true,
      autoMatched,
      suggested,
      unmatchedAfter,
      suggestions: suggestions.slice(0, 20),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

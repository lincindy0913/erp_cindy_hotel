// @deprecated — 舊版月調節表系統。新功能請在 /api/reconciliation/import/ 開發。
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { RECON_LINE_STATUS } from '@/lib/recon-statuses';

export const dynamic = 'force-dynamic';

function rowHash(accountId, line) {
  const raw = [
    String(accountId),
    line.txDate       || '',
    String(parseFloat(line.creditAmount) || 0),
    String(parseFloat(line.debitAmount)  || 0),
    (line.description || '').trim(),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 64);
}

// POST /api/bank-reconciliation/[id]/import-csv
//
// 批次匯入已解析的存摺明細（前端用 BankAccountFormat 解析 CSV 後送來）。
// 以 row hash 去重，不會重複匯入同一筆。
// 可選擇性附上期初/期末餘額以自動更新調節表欄位。
//
// body: {
//   bankFormatId?: number,
//   lines: [{ txDate, description?, debitAmount?, creditAmount?, runningBalance?, referenceNo? }],
//   openingBankBalance?: number,
//   closingBankBalance?: number,
// }
export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt((await params).id);
    const body = await request.json();

    const { lines, openingBankBalance, closingBankBalance } = body;

    if (!Array.isArray(lines) || lines.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '需提供至少一筆明細', 400);
    }

    const stmt = await prisma.bankStatement.findUnique({
      where: { id },
      select: { id: true, accountId: true },
    });
    if (!stmt) return createErrorResponse('NOT_FOUND', '找不到調節表', 404);

    // 計算所有 hash，批次查詢已存在者
    const hashes = lines.map(l => rowHash(stmt.accountId, l));
    const existingLines = await prisma.bankReconLine.findMany({
      where: { bankStatementId: id },
      select: { txDate: true, creditAmount: true, debitAmount: true, description: true },
    });
    const existingHashes = new Set(
      existingLines.map(l => rowHash(stmt.accountId, l))
    );

    const toInsert = [];
    let skipped = 0;

    for (let i = 0; i < lines.length; i++) {
      if (existingHashes.has(hashes[i])) { skipped++; continue; }
      const l = lines[i];
      toInsert.push({
        bankStatementId: id,
        txDate:          String(l.txDate || ''),
        description:     l.description  || null,
        creditAmount:    parseFloat(l.creditAmount)  || 0,
        debitAmount:     parseFloat(l.debitAmount)   || 0,
        runningBalance:  l.runningBalance != null ? parseFloat(l.runningBalance) : null,
        matchStatus:     RECON_LINE_STATUS.UNMATCHED,
      });
    }

    // 批次寫入 + 選擇性更新期初/期末餘額
    await prisma.$transaction(async (tx) => {
      if (toInsert.length > 0) {
        await tx.bankReconLine.createMany({ data: toInsert });
      }

      const balanceUpdate = {};
      if (openingBankBalance != null) balanceUpdate.openingBankBalance = parseFloat(openingBankBalance);
      if (closingBankBalance != null) balanceUpdate.closingBankBalance = parseFloat(closingBankBalance);
      if (Object.keys(balanceUpdate).length > 0) {
        await tx.bankStatement.update({ where: { id }, data: balanceUpdate });
      }
    });

    return NextResponse.json({
      inserted: toInsert.length,
      skipped,
      total: lines.length,
      message: skipped > 0
        ? `匯入 ${toInsert.length} 筆，跳過 ${skipped} 筆重複`
        : `成功匯入 ${toInsert.length} 筆`,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

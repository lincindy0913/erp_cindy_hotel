import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/** 合併說明、參考號、備註欄供比對（正規化空白與 HTML 換行） */
function normalizeLineText(line) {
  const raw = [line.description || '', line.referenceNo || '', line.note || '']
    .join(' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return raw;
}

function amountMatchesLine(tx, debitAmount, creditAmount) {
  const txAmt = Number(tx.amount);
  if ((tx.type === '支出' || tx.type === '移轉') && debitAmount > 0 && Math.abs(txAmt - debitAmount) < 0.01) {
    return true;
  }
  if ((tx.type === '收入' || tx.type === '移轉入') && creditAmount > 0 && Math.abs(txAmt - creditAmount) < 0.01) {
    return true;
  }
  return false;
}

function remarkMatchesBooking(booking, lineText) {
  if (!booking || !lineText) return false;
  const t = lineText;
  const d5 = booking.depositLast5 != null ? String(booking.depositLast5).trim() : '';
  if (d5.length >= 1 && t.includes(d5)) return true;
  const t5 = booking.transferLast5 != null ? String(booking.transferLast5).trim() : '';
  if (t5.length >= 1 && t.includes(t5)) return true;
  const name = booking.guestName != null ? String(booking.guestName).trim() : '';
  if (name.length >= 1 && t.includes(name)) return true;
  return false;
}

function bnbSourceTypes() {
  return ['bnb_deposit', 'bnb_cash', 'bnb_transfer', 'bnb_card'];
}

function pickRemarkBest(candidates, lineText, bnbMap) {
  if (!lineText || candidates.length === 0) return null;
  const hits = [];
  for (const tx of candidates) {
    if (!bnbSourceTypes().includes(tx.sourceType)) continue;
    const booking = bnbMap.get(tx.sourceRecordId);
    if (remarkMatchesBooking(booking, lineText)) hits.push(tx);
  }
  if (hits.length === 1) return { tx: hits[0], by: 'auto_rmk' };
  return null;
}

// POST: Import bank statement
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const { accountId, bankFormatId, year, month, fileName, lines } = data;

    if (!accountId || !bankFormatId || !year || !month || !lines || !Array.isArray(lines)) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '帳戶、銀行格式、年份、月份及明細資料為必填', 400);
    }

    // Verify account exists
    const account = await prisma.cashAccount.findUnique({ where: { id: parseInt(accountId) } });
    if (!account) {
      return createErrorResponse('NOT_FOUND', '帳戶不存在', 404);
    }

    // Generate import number: BSI-YYYYMMDD-XXX
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const countToday = await prisma.bankStatementImport.count({
      where: { importNo: { startsWith: `BSI-${dateStr}` } },
    });
    const importNo = `BSI-${dateStr}-${String(countToday + 1).padStart(3, '0')}`;

    // Create BankStatementImport record
    const importRecord = await prisma.bankStatementImport.create({
      data: {
        importNo,
        accountId: parseInt(accountId),
        bankFormatId: parseInt(bankFormatId),
        statementYear: parseInt(year),
        statementMonth: parseInt(month),
        rawFileName: fileName || 'manual_import.csv',
        parseStatus: 'completed',
        totalLines: lines.length,
        parsedLines: lines.length,
      },
    });

    // Create or get BankReconciliation for this account/month
    let reconciliation = await prisma.bankReconciliation.findUnique({
      where: {
        accountId_statementYear_statementMonth: {
          accountId: parseInt(accountId),
          statementYear: parseInt(year),
          statementMonth: parseInt(month),
        },
      },
    });

    if (!reconciliation) {
      // Calculate balances
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
      const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      // Use groupBy aggregation instead of loading all rows
      const [beforeGroups, monthGroups] = await Promise.all([
        prisma.cashTransaction.groupBy({
          by: ['type'],
          where: { accountId: parseInt(accountId), transactionDate: { lt: monthStart } },
          _sum: { amount: true },
        }),
        prisma.cashTransaction.groupBy({
          by: ['type'],
          where: { accountId: parseInt(accountId), transactionDate: { gte: monthStart, lt: monthEnd } },
          _sum: { amount: true },
        }),
      ]);

      let openingBalance = Number(account.openingBalance);
      for (const g of beforeGroups) {
        const amt = Number(g._sum.amount || 0);
        if (g.type === '收入' || g.type === '移轉入') openingBalance += amt;
        else if (g.type === '支出' || g.type === '移轉') openingBalance -= amt;
      }

      let closingBalanceSystem = openingBalance;
      for (const g of monthGroups) {
        const amt = Number(g._sum.amount || 0);
        if (g.type === '收入' || g.type === '移轉入') closingBalanceSystem += amt;
        else if (g.type === '支出' || g.type === '移轉') closingBalanceSystem -= amt;
      }

      const reconDateStr = `${year}${String(month).padStart(2, '0')}`;
      const reconCount = await prisma.bankReconciliation.count({
        where: { reconciliationNo: { startsWith: `REC-${reconDateStr}` } },
      });
      const reconciliationNo = `REC-${reconDateStr}-${String(reconCount + 1).padStart(3, '0')}`;

      reconciliation = await prisma.bankReconciliation.create({
        data: {
          reconciliationNo,
          accountId: parseInt(accountId),
          statementYear: parseInt(year),
          statementMonth: parseInt(month),
          importId: importRecord.id,
          openingBalance,
          closingBalanceSystem,
          closingBalanceBank: 0,
          difference: closingBalanceSystem,
          status: 'draft',
        },
      });
    } else {
      // Update import reference
      await prisma.bankReconciliation.update({
        where: { id: reconciliation.id },
        data: { importId: importRecord.id },
      });
    }

    // Get system transactions for auto-match
    const monthStart2 = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth2 = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
    const nextYear2 = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
    const monthEnd2 = `${nextYear2}-${String(nextMonth2).padStart(2, '0')}-01`;

    const systemTxs = await prisma.cashTransaction.findMany({
      where: {
        accountId: parseInt(accountId),
        transactionDate: { gte: monthStart2, lt: monthEnd2 },
      },
      take: 2000,
    });

    // Pre-load BnB booking data（訂金／當天匯款後五碼、房客姓名）
    const bnbTxIds = systemTxs
      .filter((tx) => bnbSourceTypes().includes(tx.sourceType))
      .map((tx) => tx.sourceRecordId)
      .filter(Boolean);
    const bnbBookings = bnbTxIds.length
      ? await prisma.bnbBookingRecord.findMany({
          where: { id: { in: bnbTxIds } },
          select: { id: true, depositLast5: true, transferLast5: true, guestName: true },
        })
      : [];
    const bnbMap = new Map(bnbBookings.map((b) => [b.id, b]));

    // Create BankStatementLine records and attempt auto-match
    let matchedCount = 0;
    const matchedTxIds = new Set();

    const lineRecords = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const debitAmount = parseFloat(line.debitAmount) || 0;
      const creditAmount = parseFloat(line.creditAmount) || 0;
      const netAmount = creditAmount - debitAmount;
      const lineText = normalizeLineText(line);

      let matchedTxId = null;
      let matchedBy = null;

      // ── 第一層：同交易日 + 同金額 ─────────────────────────────
      const candidatesDate = [];
      for (const tx of systemTxs) {
        if (matchedTxIds.has(tx.id)) continue;
        if (tx.transactionDate !== line.txDate) continue;
        if (amountMatchesLine(tx, debitAmount, creditAmount)) candidatesDate.push(tx);
      }

      if (candidatesDate.length === 1) {
        matchedTxId = candidatesDate[0].id;
        matchedBy = 'auto';
      } else if (candidatesDate.length > 1) {
        const picked = pickRemarkBest(candidatesDate, lineText, bnbMap);
        if (picked) {
          matchedTxId = picked.tx.id;
          matchedBy = picked.by;
        }
        // 多筆同日同額且備註無法唯一區分 → 不自動比對，留人工
      } else {
        // ── 第二層：同帳務月份內、金額相符、日期可不同；須備註與民宿欄位吻合且唯一 ──
        const candidatesAmt = [];
        for (const tx of systemTxs) {
          if (matchedTxIds.has(tx.id)) continue;
          if (amountMatchesLine(tx, debitAmount, creditAmount)) candidatesAmt.push(tx);
        }
        const remarkHits = [];
        for (const tx of candidatesAmt) {
          if (!bnbSourceTypes().includes(tx.sourceType)) continue;
          const booking = bnbMap.get(tx.sourceRecordId);
          if (remarkMatchesBooking(booking, lineText)) remarkHits.push(tx);
        }
        if (remarkHits.length === 1) {
          matchedTxId = remarkHits[0].id;
          matchedBy = 'auto_rmk_d';
        }
      }

      if (matchedTxId) {
        matchedTxIds.add(matchedTxId);
        matchedCount++;
      }

      const noteVal = line.note != null && String(line.note).trim() !== '' ? String(line.note).trim() : null;

      lineRecords.push({
        importId: importRecord.id,
        accountId: parseInt(accountId),
        lineNo: i + 1,
        txDate: line.txDate || '',
        description: line.description || null,
        debitAmount,
        creditAmount,
        netAmount,
        runningBalance: line.runningBalance ? parseFloat(line.runningBalance) : null,
        referenceNo: line.referenceNo || null,
        note: noteVal,
        matchStatus: matchedTxId ? 'matched' : 'unprocessed',
        matchedTransactionId: matchedTxId,
        matchedBy,
        reconciliationId: reconciliation.id,
      });
    }

    // Batch create lines
    await prisma.bankStatementLine.createMany({
      data: lineRecords,
    });

    // Update reconciliation line counts
    const totalBankLines = lineRecords.length;
    const bankOnlyLines = lineRecords.filter((l) => l.matchStatus === 'unprocessed').length;
    const systemOnlyCount = systemTxs.length - matchedCount;

    await prisma.bankReconciliation.update({
      where: { id: reconciliation.id },
      data: {
        totalBankLines,
        matchedLines: matchedCount,
        bankOnlyLines,
        systemOnlyLines: systemOnlyCount,
      },
    });

    return NextResponse.json(
      {
        importId: importRecord.id,
        importNo: importRecord.importNo,
        reconciliationId: reconciliation.id,
        totalLines: lines.length,
        matchedCount,
        bankOnlyCount: bankOnlyLines,
        systemOnlyCount,
        message: `成功匯入 ${lines.length} 筆銀行對帳單，自動比對 ${matchedCount} 筆（含備註輔助比對者標記為 auto_rmk / auto_rmk_d）`,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

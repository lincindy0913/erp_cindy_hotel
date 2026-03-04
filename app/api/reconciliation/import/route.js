import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// POST: Import bank statement
export async function POST(request) {
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
      where: { importNo: { startsWith: `BSI-${dateStr}` } }
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
        parsedLines: lines.length
      }
    });

    // Create or get BankReconciliation for this account/month
    let reconciliation = await prisma.bankReconciliation.findUnique({
      where: {
        accountId_statementYear_statementMonth: {
          accountId: parseInt(accountId),
          statementYear: parseInt(year),
          statementMonth: parseInt(month)
        }
      }
    });

    if (!reconciliation) {
      // Calculate balances
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
      const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      const txBefore = await prisma.cashTransaction.findMany({
        where: { accountId: parseInt(accountId), transactionDate: { lt: monthStart } }
      });

      let openingBalance = Number(account.openingBalance);
      txBefore.forEach(tx => {
        const amt = Number(tx.amount);
        if (tx.type === '收入' || tx.type === '移轉入') openingBalance += amt;
        else if (tx.type === '支出' || tx.type === '移轉') openingBalance -= amt;
      });

      const txInMonth = await prisma.cashTransaction.findMany({
        where: { accountId: parseInt(accountId), transactionDate: { gte: monthStart, lt: monthEnd } }
      });

      let closingBalanceSystem = openingBalance;
      txInMonth.forEach(tx => {
        const amt = Number(tx.amount);
        if (tx.type === '收入' || tx.type === '移轉入') closingBalanceSystem += amt;
        else if (tx.type === '支出' || tx.type === '移轉') closingBalanceSystem -= amt;
      });

      const reconDateStr = `${year}${String(month).padStart(2, '0')}`;
      const reconCount = await prisma.bankReconciliation.count({
        where: { reconciliationNo: { startsWith: `REC-${reconDateStr}` } }
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
          status: 'draft'
        }
      });
    } else {
      // Update import reference
      await prisma.bankReconciliation.update({
        where: { id: reconciliation.id },
        data: { importId: importRecord.id }
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
        transactionDate: { gte: monthStart2, lt: monthEnd2 }
      }
    });

    // Create BankStatementLine records and attempt auto-match
    let matchedCount = 0;
    const matchedTxIds = new Set();

    const lineRecords = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const debitAmount = parseFloat(line.debitAmount) || 0;
      const creditAmount = parseFloat(line.creditAmount) || 0;
      const netAmount = creditAmount - debitAmount;

      // Auto-match: find system transaction with same date and amount
      let matchedTxId = null;
      let matchedBy = null;

      for (const tx of systemTxs) {
        if (matchedTxIds.has(tx.id)) continue;

        const txAmt = Number(tx.amount);
        const txDate = tx.transactionDate;
        const lineDate = line.txDate;

        // Match by date and amount
        if (txDate === lineDate) {
          if ((tx.type === '支出' || tx.type === '移轉') && Math.abs(txAmt - debitAmount) < 0.01 && debitAmount > 0) {
            matchedTxId = tx.id;
            matchedBy = 'auto';
            matchedTxIds.add(tx.id);
            matchedCount++;
            break;
          } else if ((tx.type === '收入' || tx.type === '移轉入') && Math.abs(txAmt - creditAmount) < 0.01 && creditAmount > 0) {
            matchedTxId = tx.id;
            matchedBy = 'auto';
            matchedTxIds.add(tx.id);
            matchedCount++;
            break;
          }
        }
      }

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
        matchStatus: matchedTxId ? 'matched' : 'unprocessed',
        matchedTransactionId: matchedTxId,
        matchedBy,
        reconciliationId: reconciliation.id
      });
    }

    // Batch create lines
    await prisma.bankStatementLine.createMany({
      data: lineRecords
    });

    // Update reconciliation line counts
    const totalBankLines = lineRecords.length;
    const bankOnlyLines = lineRecords.filter(l => l.matchStatus === 'unprocessed').length;
    const systemOnlyCount = systemTxs.length - matchedCount;

    await prisma.bankReconciliation.update({
      where: { id: reconciliation.id },
      data: {
        totalBankLines,
        matchedLines: matchedCount,
        bankOnlyLines,
        systemOnlyLines: systemOnlyCount
      }
    });

    return NextResponse.json({
      importId: importRecord.id,
      importNo: importRecord.importNo,
      reconciliationId: reconciliation.id,
      totalLines: lines.length,
      matchedCount,
      bankOnlyCount: bankOnlyLines,
      systemOnlyCount,
      message: `成功匯入 ${lines.length} 筆銀行對帳單，自動比對 ${matchedCount} 筆`
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

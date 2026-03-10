import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Helper: recalculate account balance
async function recalcBalance(tx, accountId) {
  const account = await tx.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const transactions = await tx.cashTransaction.findMany({
    where: { accountId },
    select: { type: true, amount: true, fee: true, hasFee: true }
  });

  let balance = Number(account.openingBalance);
  for (const t of transactions) {
    const amt = Number(t.amount);
    const fee = t.hasFee ? Number(t.fee) : 0;
    if (t.type === '收入') balance += amt;
    else if (t.type === '支出') { balance -= amt; balance -= fee; }
    else if (t.type === '移轉') { balance -= amt; balance -= fee; }
    else if (t.type === '移轉入') balance += amt;
  }

  await tx.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: balance }
  });
}

// Generate transaction number: CF-YYYYMMDD-XXXX
async function generateTransactionNo(tx, date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;

  const existing = await tx.cashTransaction.findMany({
    where: { transactionNo: { startsWith: prefix } },
    select: { transactionNo: true }
  });

  let maxSeq = 0;
  for (const t of existing) {
    const seq = parseInt(t.transactionNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// POST: 確認代訂佣金，送出至現金流
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.CASHFLOW_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { entryIds, accountId, transactionDate } = body;

    if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇要確認的記錄', 400);
    }
    if (!accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇存簿帳戶', 400);
    }
    if (!transactionDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇交易日期', 400);
    }

    const acctId = parseInt(accountId);
    const account = await prisma.cashAccount.findUnique({ where: { id: acctId } });
    if (!account) {
      return createErrorResponse('NOT_FOUND', '找不到指定的存簿帳戶', 404);
    }

    // Fetch all entries to confirm
    const entries = await prisma.monthlyManualCommissionEntry.findMany({
      where: { id: { in: entryIds.map(id => parseInt(id)) } }
    });

    if (entries.length === 0) {
      return createErrorResponse('NOT_FOUND', '找不到指定的記錄', 404);
    }

    // Check all entries are DRAFT
    const nonDraft = entries.filter(e => e.status !== 'DRAFT');
    if (nonDraft.length > 0) {
      return createErrorResponse('VALIDATION_FAILED', `${nonDraft.length} 筆記錄已確認過，不可重複送出`, 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const created = [];

      for (const entry of entries) {
        const commissionAmount = Number(entry.commissionAmount);
        if (commissionAmount <= 0) continue;

        // AP = 飯店要付佣金給代訂中心 → 支出
        // AR = 飯店向代訂中心收取佣金 → 收入
        const txType = entry.arOrAp === 'AP' ? '支出' : '收入';
        const txNo = await generateTransactionNo(tx, transactionDate);
        const monthLabel = entry.settlementMonth ? `${entry.settlementMonth.substring(0, 4)}/${entry.settlementMonth.substring(4)}` : '';

        const cashTx = await tx.cashTransaction.create({
          data: {
            transactionNo: txNo,
            transactionDate,
            type: txType,
            warehouse: null,
            accountId: acctId,
            categoryId: null,
            supplierId: null,
            paymentNo: null,
            amount: commissionAmount,
            fee: 0,
            hasFee: false,
            accountingSubject: null,
            paymentTerms: null,
            description: `${monthLabel} ${entry.agencyName} 代訂佣金（${entry.arOrAp === 'AP' ? '應付' : '應收'}）`,
            sourceType: 'pms_manual_commission',
            sourceRecordId: entry.id,
            isAutoCreated: true,
            autoCreationReason: 'PMS代訂佣金確認',
            status: '已確認'
          }
        });

        // Update entry status
        await tx.monthlyManualCommissionEntry.update({
          where: { id: entry.id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
          }
        });

        created.push({
          entryId: entry.id,
          agencyName: entry.agencyName,
          transactionNo: txNo,
          type: txType,
          amount: commissionAmount,
        });
      }

      // Recalculate account balance
      await recalcBalance(tx, acctId);

      return created;
    });

    return NextResponse.json({
      success: true,
      message: `已確認 ${result.length} 筆，已送出至現金流`,
      transactions: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

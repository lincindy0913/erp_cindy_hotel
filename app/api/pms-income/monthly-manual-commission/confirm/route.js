import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Generate payment order number: PAY-YYYYMMDD-XXXX
async function generateOrderNo(date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `PAY-${dateStr}-`;
  const existing = await prisma.paymentOrder.findMany({
    where: { orderNo: { startsWith: prefix } },
    select: { orderNo: true }
  });
  let maxSeq = 0;
  for (const item of existing) {
    const seq = parseInt(item.orderNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// POST: 確認代訂佣金 → 推送至出納（建立 PaymentOrder）
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
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇付款帳戶', 400);
    }
    if (!transactionDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇交易日期', 400);
    }

    const acctId = parseInt(accountId);
    const account = await prisma.cashAccount.findUnique({ where: { id: acctId } });
    if (!account) {
      return createErrorResponse('NOT_FOUND', '找不到指定的帳戶', 404);
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

    const userName = auth.user?.name || auth.user?.email || 'system';

    const result = await prisma.$transaction(async (tx) => {
      const created = [];

      for (const entry of entries) {
        const commissionAmount = Number(entry.commissionAmount);
        if (commissionAmount <= 0) continue;

        const monthLabel = entry.settlementMonth
          ? `${entry.settlementMonth.substring(0, 4)}/${entry.settlementMonth.substring(4)}`
          : '';

        // AP = 飯店要付佣金給代訂中心 → 支出 → 推送出納
        // AR = 飯店向代訂中心收取佣金 → 收入（不需出納處理，直接記錄）
        if (entry.arOrAp === 'AP') {
          // Create PaymentOrder for cashier to execute
          const orderNo = await generateOrderNo(transactionDate);
          const paymentOrder = await tx.paymentOrder.create({
            data: {
              orderNo,
              invoiceIds: JSON.stringify([]),
              supplierName: entry.agencyName,
              paymentMethod: '匯款',
              amount: commissionAmount,
              discount: 0,
              netAmount: commissionAmount,
              dueDate: transactionDate,
              accountId: acctId,
              note: `${monthLabel} ${entry.agencyName} 代訂佣金（應付）- 來源：PMS佣金管理`,
              status: '待出納',
              createdBy: userName
            }
          });

          // Update entry status to SUBMITTED (待出納)
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
            type: '支出',
            amount: commissionAmount,
            orderNo: paymentOrder.orderNo,
            destination: '出納'
          });
        } else {
          // AR: 收入 — directly create cashflow (no cashier needed for income)
          const txNo = await generateTxNo(tx, transactionDate);
          await tx.cashTransaction.create({
            data: {
              transactionNo: txNo,
              transactionDate,
              type: '收入',
              accountId: acctId,
              amount: commissionAmount,
              fee: 0,
              hasFee: false,
              description: `${monthLabel} ${entry.agencyName} 代訂佣金（應收）`,
              sourceType: 'pms_manual_commission',
              sourceRecordId: entry.id,
              isAutoCreated: true,
              autoCreationReason: 'PMS代訂佣金確認（應收）',
              status: '已確認'
            }
          });

          // Recalc balance for AR income
          await recalcBalance(tx, acctId);

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
            type: '收入',
            amount: commissionAmount,
            transactionNo: txNo,
            destination: '現金流'
          });
        }
      }

      return created;
    });

    const apCount = result.filter(r => r.destination === '出納').length;
    const arCount = result.filter(r => r.destination === '現金流').length;

    return NextResponse.json({
      success: true,
      message: `已處理 ${result.length} 筆：${apCount > 0 ? `${apCount}筆應付已推送出納` : ''}${arCount > 0 ? `${arCount}筆應收已入現金流` : ''}`,
      transactions: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

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

// Generate transaction number
async function generateTxNo(tx, date) {
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

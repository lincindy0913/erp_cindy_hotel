import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

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

// POST: 將收入記錄明細的「借方」收款方式依帳戶設定同步至現金流交易
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.PMS_IMPORT);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const warehouse = data.warehouse ? String(data.warehouse).trim() : null;
    const startDate = data.startDate ? String(data.startDate).trim() : null;
    const endDate = data.endDate ? String(data.endDate).trim() : null;
    const recordIds = Array.isArray(data.recordIds) ? data.recordIds.map(id => parseInt(id)).filter(Boolean) : null;

    const where = { entryType: '借方' };
    if (recordIds && recordIds.length > 0) {
      where.id = { in: recordIds };
    } else {
      if (warehouse) where.warehouse = warehouse;
      if (startDate && endDate) where.businessDate = { gte: startDate, lte: endDate };
      else if (startDate) where.businessDate = { gte: startDate };
      else if (endDate) where.businessDate = { lte: endDate };
    }

    const records = await prisma.pmsIncomeRecord.findMany({
      where,
      orderBy: [{ businessDate: 'asc' }, { id: 'asc' }]
    });

    const configs = await prisma.pmsPaymentMethodConfig.findMany({
      where: { isActive: true }
    });
    const configMap = {};
    for (const c of configs) {
      const key = `${c.warehouse ?? ''}|${c.pmsColumnName}`;
      configMap[key] = c;
    }

    const creditCardFeeEntries = await prisma.pmsCreditCardFeeEntry.findMany({});
    const feeMap = {};
    for (const f of creditCardFeeEntries) {
      feeMap[`${f.warehouse}|${f.settlementDate}`] = Number(f.feeAmount);
    }

    let created = 0;
    const errors = [];
    const processedIds = new Set();

    const isCreditCard = (pmsColumnName) =>
      String(pmsColumnName).includes('信用卡');

    await prisma.$transaction(async (tx) => {
      for (const rec of records) {
        if (rec.cashTransactionId || processedIds.has(rec.id)) continue;

        const key = `${rec.warehouse ?? ''}|${rec.pmsColumnName}`;
        const config = configMap[key];
        if (!config || !config.cashAccountId) {
          errors.push(`未設定帳戶: ${rec.warehouse} / ${rec.pmsColumnName}`);
          continue;
        }

        const amount = Number(rec.amount);
        const accountingSubject = [rec.accountingCode, rec.accountingName].filter(Boolean).join(' ') || rec.pmsColumnName;

        if (isCreditCard(rec.pmsColumnName)) {
          const delayDays = config.settlementDelayDays || 0;
          const bd = new Date(rec.businessDate);
          bd.setDate(bd.getDate() + delayDays);
          const settlementDate = bd.toISOString().split('T')[0];

          const existingGroupTx = await tx.cashTransaction.findFirst({
            where: {
              sourceType: 'pms_credit_card_settlement',
              transactionDate: settlementDate,
              warehouse: rec.warehouse,
              accountId: config.cashAccountId
            }
          });

          if (existingGroupTx) {
            const groupRecords = records.filter(r =>
              r.entryType === '借方' &&
              isCreditCard(r.pmsColumnName) &&
              r.warehouse === rec.warehouse &&
              !r.cashTransactionId &&
              (() => {
                const d = new Date(r.businessDate);
                d.setDate(d.getDate() + (configMap[`${r.warehouse ?? ''}|${r.pmsColumnName}`]?.settlementDelayDays || 0));
                return d.toISOString().split('T')[0] === settlementDate;
              })()
            );
            for (const r of groupRecords) {
              await tx.pmsIncomeRecord.update({ where: { id: r.id }, data: { cashTransactionId: existingGroupTx.id } });
              processedIds.add(r.id);
            }
            created += groupRecords.length;
            continue;
          }

          const groupRecords = records.filter(r =>
            r.entryType === '借方' &&
            isCreditCard(r.pmsColumnName) &&
            r.warehouse === rec.warehouse &&
            !r.cashTransactionId &&
            !processedIds.has(r.id) &&
            (() => {
              const d = new Date(r.businessDate);
              d.setDate(d.getDate() + (configMap[`${r.warehouse ?? ''}|${r.pmsColumnName}`]?.settlementDelayDays || 0));
              return d.toISOString().split('T')[0] === settlementDate;
            })()
          );

          const groupSum = groupRecords.reduce((s, r) => s + Number(r.amount), 0);
          const groupFee = feeMap[`${rec.warehouse}|${settlementDate}`] ?? 0;
          const groupNet = Math.max(0, groupSum - groupFee);

          const txNo = await generateTransactionNo(tx, settlementDate);
          const newTx = await tx.cashTransaction.create({
            data: {
              transactionNo: txNo,
              transactionDate: settlementDate,
              type: '收入',
              warehouse: rec.warehouse,
              accountId: config.cashAccountId,
              categoryId: null,
              supplierId: null,
              paymentNo: null,
              amount: groupNet,
              fee: groupFee,
              hasFee: groupFee > 0,
              accountingSubject,
              paymentTerms: null,
              description: `PMS 信用卡收入 ${rec.businessDate} 入帳${groupFee > 0 ? `（扣手續費 ${groupFee}）` : ''}`,
              sourceType: 'pms_credit_card_settlement',
              sourceRecordId: rec.id,
              isAutoCreated: true,
              autoCreationReason: 'pms_sync',
              status: '已確認'
            }
          });

          for (const r of groupRecords) {
            await tx.pmsIncomeRecord.update({
              where: { id: r.id },
              data: { cashTransactionId: newTx.id }
            });
            processedIds.add(r.id);
          }
          await recalcBalance(tx, config.cashAccountId);
          created += groupRecords.length;
          continue;
        }

        const txDate = rec.businessDate;
        const txNo = await generateTransactionNo(tx, txDate);
        const newTx = await tx.cashTransaction.create({
          data: {
            transactionNo: txNo,
            transactionDate: txDate,
            type: '收入',
            warehouse: rec.warehouse,
            accountId: config.cashAccountId,
            categoryId: null,
            supplierId: null,
            paymentNo: null,
            amount,
            fee: 0,
            hasFee: false,
            accountingSubject,
            paymentTerms: null,
            description: `PMS ${rec.pmsColumnName} ${rec.businessDate}`,
            sourceType: 'pms_income_record',
            sourceRecordId: rec.id,
            isAutoCreated: true,
            autoCreationReason: 'pms_sync',
            status: '已確認'
          }
        });

        await tx.pmsIncomeRecord.update({
          where: { id: rec.id },
          data: { cashTransactionId: newTx.id }
        });
        await recalcBalance(tx, config.cashAccountId);
        processedIds.add(rec.id);
        created++;
      }
    });

    return NextResponse.json({
      success: true,
      created,
      errors: errors.length ? errors : undefined
    });
  } catch (error) {
    console.error('push-to-cashflow error:', error);
    return handleApiError(error);
  }
}

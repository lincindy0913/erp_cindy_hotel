import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { createAlert, ALERT_CATEGORIES } from '@/lib/alert';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';


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

    // Pre-collect warehouses that have credit card records for batch pre-fetch
    const ccWarehouses = [...new Set(
      records.filter(r => !r.cashTransactionId && isCreditCard(r.pmsColumnName)).map(r => r.warehouse)
    )];

    await prisma.$transaction(async (tx) => {
      // Batch pre-fetch existing CC settlement/fee transactions to avoid N+1
      const existingCCTxs = ccWarehouses.length > 0
        ? await tx.cashTransaction.findMany({
            where: {
              sourceType: { in: ['pms_credit_card_settlement', 'pms_credit_card_fee'] },
              warehouse: { in: ccWarehouses },
            },
            select: { id: true, sourceType: true, transactionDate: true, warehouse: true, accountId: true },
          })
        : [];
      const existingSettlementMap = new Map();
      const existingFeeMap = new Map();
      for (const t of existingCCTxs) {
        const mk = `${t.warehouse ?? ''}|${t.transactionDate}|${t.accountId}`;
        if (t.sourceType === 'pms_credit_card_settlement') existingSettlementMap.set(mk, t);
        else if (t.sourceType === 'pms_credit_card_fee') existingFeeMap.set(mk, t);
      }

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

          // 所有同館別、同撥款日的信用卡記錄（未推送的）
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
          const feeSubject = config.feeAccountingCode
            ? `${config.feeAccountingCode} 信用卡手續費`
            : '信用卡手續費';

          // 1. 信用卡收入（全額，未扣手續費）
          const settlementMapKey = `${rec.warehouse ?? ''}|${settlementDate}|${config.cashAccountId}`;
          const existingGroupTx = existingSettlementMap.get(settlementMapKey) || null;

          if (!existingGroupTx && groupRecords.length > 0) {
            const txNo = await nextCashTransactionNo(tx, settlementDate);
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
                amount: groupSum,
                fee: 0,
                hasFee: false,
                accountingSubject,
                paymentTerms: null,
                description: `PMS 信用卡收入 撥款日 ${settlementDate}（PMS 請款日 ${rec.businessDate}，共 ${groupRecords.length} 筆合計 ${groupSum}）`,
                sourceType: 'pms_credit_card_settlement',
                sourceRecordId: rec.id,
                isAutoCreated: true,
                autoCreationReason: 'pms_sync',
                status: '已確認'
              }
            });
            existingSettlementMap.set(settlementMapKey, newTx);
            for (const r of groupRecords) {
              await tx.pmsIncomeRecord.update({ where: { id: r.id }, data: { cashTransactionId: newTx.id } });
              processedIds.add(r.id);
            }
            created += groupRecords.length;
          } else if (existingGroupTx) {
            // 已有收入交易：只補連結未連結的記錄
            for (const r of groupRecords) {
              await tx.pmsIncomeRecord.update({ where: { id: r.id }, data: { cashTransactionId: existingGroupTx.id } });
              processedIds.add(r.id);
            }
            created += groupRecords.length;
          }

          // 2. 信用卡手續費（獨立一筆支出）
          if (groupFee > 0) {
            const feeMapKey = `${rec.warehouse ?? ''}|${settlementDate}|${config.cashAccountId}`;
            const existingFeeTx = existingFeeMap.get(feeMapKey) || null;
            if (!existingFeeTx) {
              const feeTxNo = await nextCashTransactionNo(tx, settlementDate);
              const createdFeeTx = await tx.cashTransaction.create({
                data: {
                  transactionNo: feeTxNo,
                  transactionDate: settlementDate,
                  type: '支出',
                  warehouse: rec.warehouse,
                  accountId: config.cashAccountId,
                  categoryId: null,
                  supplierId: null,
                  paymentNo: null,
                  amount: groupFee,
                  fee: 0,
                  hasFee: false,
                  accountingSubject: feeSubject,
                  paymentTerms: null,
                  description: `PMS 信用卡手續費 撥款日 ${settlementDate}（對帳單請款日 ${rec.businessDate}）`,
                  sourceType: 'pms_credit_card_fee',
                  sourceRecordId: null,
                  isAutoCreated: true,
                  autoCreationReason: 'pms_sync',
                  status: '已確認'
                }
              });
              existingFeeMap.set(feeMapKey, createdFeeTx);
            }
          }

          // 重算存簿餘額（收入全額 − 手續費支出 = 撥款淨額）
          await recalcBalance(tx, config.cashAccountId);
          continue;
        }

        const txDate = rec.businessDate;
        const txNo = await nextCashTransactionNo(tx, txDate);
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
    console.error('push-to-cashflow error:', error.message || error);
    createAlert(
      ALERT_CATEGORIES.WEBHOOK_FAILURE,
      'PMS 推送金流失敗',
      error.message || 'Unknown error',
      { route: '/api/pms-income/push-to-cashflow' }
    ).catch(() => {});
    return handleApiError(error, '/api/pms-income/push-to-cashflow');
  }
}

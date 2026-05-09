import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';

// POST: 將對帳單建立現金流分錄
//   - 收入：撥款淨額 → 銀行帳戶（撥款日）
//   - 支出：手續費   → 手續費科目（撥款日）
export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PMS_IMPORT);
  if (!auth.ok) return auth.response;

  try {
    const id  = parseInt(params.id);
    const stmt = await prisma.creditCardStatement.findUnique({ where: { id } });
    if (!stmt) return createErrorResponse('NOT_FOUND', '找不到對帳單', 404);
    if (stmt.status === '已建帳') {
      return createErrorResponse('DUPLICATE_SETTLEMENT', '此對帳單已建帳', 409);
    }
    if (!stmt.bankAccountId) {
      return createErrorResponse('VALIDATION_FAILED', '請先設定入帳帳戶再建帳', 400);
    }

    const feeCategory = await prisma.cashCategory.findFirst({
      where: { systemCode: 'pms_cc_fee' },
    });
    const providerName = stmt.provider || stmt.bankName || '';
    const incomeCategoryCode = providerName.includes('月結') ? 'pms_income_settlement' : 'pms_cc_income';
    const incomeCategory = await prisma.cashCategory.findFirst({
      where: { systemCode: incomeCategoryCode },
    });

    const netAmount = Number(stmt.netAmount);
    const feeAmount = Number(stmt.totalFee) + Number(stmt.serviceFee) + Number(stmt.otherFee);
    const txDate    = stmt.paymentDate || stmt.billingDate;

    const result = await prisma.$transaction(async (tx) => {
      // 1. 建立收入交易（撥款淨額）
      const incTxNo = await nextCashTransactionNo(tx, txDate);
      const incTx = await tx.cashTransaction.create({
        data: {
          transactionNo:   incTxNo,
          transactionDate: txDate,
          type:            '收入',
          warehouse:       stmt.warehouse,
          accountId:       stmt.bankAccountId,
          categoryId:      incomeCategory?.id ?? null,
          amount:          netAmount,
          fee:             0,
          hasFee:          false,
          accountingSubject: `信用卡收入 ${stmt.provider}`,
          description:     `${providerName} 信用卡撥款 ${txDate}（請款日 ${stmt.billingDate}，共 ${Number(stmt.totalAmount)} 元）`,
          sourceType:      'cc_statement_income',
          sourceRecordId:  stmt.id,
          isAutoCreated:   true,
          autoCreationReason: `CC對帳單 ${stmt.billingDate}`,
          status:          '已確認',
        },
      });

      // 2. 建立手續費支出交易
      let feeTx = null;
      if (feeAmount > 0) {
        const feeTxNo = await nextCashTransactionNo(tx, txDate);
        feeTx = await tx.cashTransaction.create({
          data: {
            transactionNo:   feeTxNo,
            transactionDate: txDate,
            type:            '支出',
            warehouse:       stmt.warehouse,
            accountId:       stmt.bankAccountId,
            categoryId:      feeCategory?.id ?? null,
            amount:          feeAmount,
            fee:             0,
            hasFee:          false,
            accountingSubject: '信用卡手續費',
            description:     `${providerName} 信用卡手續費 ${txDate}（請款日 ${stmt.billingDate}）`,
            sourceType:      'cc_statement_fee',
            sourceRecordId:  stmt.id,
            isAutoCreated:   true,
            autoCreationReason: `CC對帳單 ${stmt.billingDate}`,
            status:          '已確認',
          },
        });
      }

      // 3. 更新對帳單狀態
      await tx.creditCardStatement.update({
        where: { id },
        data: {
          status:    '已建帳',
          incomeTxId: incTx.id,
          feeTxId:    feeTx?.id ?? null,
        },
      });

      // 4. 重算帳戶餘額
      await recalcBalance(tx, stmt.bankAccountId);

      return { incTxId: incTx.id, feeTxId: feeTx?.id ?? null };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}

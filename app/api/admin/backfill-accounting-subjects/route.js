/**
 * 一次性補填歷史 CashTransaction.accountingSubject
 * POST /api/admin/backfill-accounting-subjects
 * 需要 ADMIN 權限，執行後可刪除此檔案
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ADMIN);
  if (!auth.ok) return auth.response;

  const stats = {
    cashierPaymentFixed: 0,
    fixedExpenseDirect: 0,
    loanPrincipal: 0,
    loanInterest: 0,
    skipped: 0,
  };

  // ────────────────────────────────────────────────────────────
  // 1. cashier_payment 來自 fixed_expense：
  //    CashTransaction.sourceRecordId = PaymentOrder.id
  //    PaymentOrder.sourceType = 'fixed_expense'
  //    → CommonExpenseRecord.paymentOrderId = PaymentOrder.id
  //    → 取第一筆 debit entryLine 的 accountingCode + accountingName
  // ────────────────────────────────────────────────────────────
  const cashierTxs = await prisma.cashTransaction.findMany({
    where: {
      sourceType: 'cashier_payment',
      accountingSubject: null,
      sourceRecordId: { not: null },
    },
    select: { id: true, sourceRecordId: true },
  });

  for (const tx of cashierTxs) {
    const po = await prisma.paymentOrder.findUnique({
      where: { id: tx.sourceRecordId },
      select: { id: true, sourceType: true },
    });
    if (!po || po.sourceType !== 'fixed_expense') { stats.skipped++; continue; }

    const rec = await prisma.commonExpenseRecord.findFirst({
      where: { paymentOrderId: po.id },
      include: { entryLines: { where: { entryType: 'debit' }, orderBy: { sortOrder: 'asc' }, take: 1 } },
    });
    const line = rec?.entryLines?.[0];
    if (!line?.accountingCode) { stats.skipped++; continue; }

    const subject = [line.accountingCode, line.accountingName].filter(Boolean).join(' ').trim();
    await prisma.cashTransaction.update({ where: { id: tx.id }, data: { accountingSubject: subject } });
    stats.cashierPaymentFixed++;
  }

  // ────────────────────────────────────────────────────────────
  // 2. fixed_expense 直接建立的 cashTx（轉帳/匯款自動執行模式）：
  //    CashTransaction.sourceType = 'fixed_expense'
  //    CashTransaction.sourceRecordId = PaymentOrder.id
  //    → 同上，查 CommonExpenseRecord 第一筆 debit line
  // ────────────────────────────────────────────────────────────
  const fixedTxs = await prisma.cashTransaction.findMany({
    where: {
      sourceType: 'fixed_expense',
      accountingSubject: null,
      sourceRecordId: { not: null },
    },
    select: { id: true, sourceRecordId: true },
  });

  for (const tx of fixedTxs) {
    const rec = await prisma.commonExpenseRecord.findFirst({
      where: { paymentOrderId: tx.sourceRecordId },
      include: { entryLines: { where: { entryType: 'debit' }, orderBy: { sortOrder: 'asc' }, take: 1 } },
    });
    const line = rec?.entryLines?.[0];
    if (!line?.accountingCode) { stats.skipped++; continue; }

    const subject = [line.accountingCode, line.accountingName].filter(Boolean).join(' ').trim();
    await prisma.cashTransaction.update({ where: { id: tx.id }, data: { accountingSubject: subject } });
    stats.fixedExpenseDirect++;
  }

  // ────────────────────────────────────────────────────────────
  // 3. loan_payment 貸款本金
  // ────────────────────────────────────────────────────────────
  const principalCount = await prisma.cashTransaction.updateMany({
    where: {
      sourceType: 'loan_payment',
      accountingSubject: null,
      description: { startsWith: '貸款本金' },
    },
    data: { accountingSubject: '21000 長期借款本金' },
  });
  stats.loanPrincipal = principalCount.count;

  // ────────────────────────────────────────────────────────────
  // 4. loan_payment 貸款利息
  // ────────────────────────────────────────────────────────────
  const interestCount = await prisma.cashTransaction.updateMany({
    where: {
      sourceType: 'loan_payment',
      accountingSubject: null,
      description: { startsWith: '貸款利息' },
    },
    data: { accountingSubject: '51500 利息費用' },
  });
  stats.loanInterest = interestCount.count;

  return NextResponse.json({
    message: '歷史會計科目補填完成',
    stats,
    total: stats.cashierPaymentFixed + stats.fixedExpenseDirect + stats.loanPrincipal + stats.loanInterest,
  });
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: List all bank reconciliations
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')) : null;
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')) : null;
    const accountId = searchParams.get('accountId') ? parseInt(searchParams.get('accountId')) : null;
    const status = searchParams.get('status');

    const where = {};
    if (year) where.statementYear = year;
    if (month) where.statementMonth = month;
    if (accountId) where.accountId = accountId;
    if (status) where.status = status;

    const reconciliations = await prisma.bankReconciliation.findMany({
      where,
      include: {
        account: {
          select: { id: true, name: true, warehouse: true, type: true, accountCode: true }
        }
      },
      orderBy: { accountId: 'asc' }
    });

    const result = reconciliations.map(r => ({
      ...r,
      openingBalance: Number(r.openingBalance),
      closingBalanceSystem: Number(r.closingBalanceSystem),
      closingBalanceBank: Number(r.closingBalanceBank),
      difference: Number(r.difference),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: Create or get reconciliation for account/month
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();
    const { accountId, year, month } = data;

    if (!accountId || !year || !month) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '帳戶、年份、月份為必填', 400);
    }

    // Check if already exists
    const existing = await prisma.bankReconciliation.findUnique({
      where: {
        accountId_statementYear_statementMonth: {
          accountId: parseInt(accountId),
          statementYear: parseInt(year),
          statementMonth: parseInt(month)
        }
      },
      include: {
        account: {
          select: { id: true, name: true, warehouse: true, type: true, accountCode: true }
        }
      }
    });

    if (existing) {
      return NextResponse.json({
        ...existing,
        openingBalance: Number(existing.openingBalance),
        closingBalanceSystem: Number(existing.closingBalanceSystem),
        closingBalanceBank: Number(existing.closingBalanceBank),
        difference: Number(existing.difference),
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
        confirmedAt: existing.confirmedAt ? existing.confirmedAt.toISOString() : null,
        isExisting: true
      });
    }

    // Calculate opening balance: account opening balance + sum of all transactions before this month
    const account = await prisma.cashAccount.findUnique({ where: { id: parseInt(accountId) } });
    if (!account) {
      return createErrorResponse('NOT_FOUND', '帳戶不存在', 404);
    }

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : parseInt(month) + 1;
    const nextYear = month === 12 ? parseInt(year) + 1 : parseInt(year);
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // Transactions before this month for opening balance
    const txBefore = await prisma.cashTransaction.findMany({
      where: {
        accountId: parseInt(accountId),
        transactionDate: { lt: monthStart }
      }
    });

    let openingBalance = Number(account.openingBalance);
    txBefore.forEach(tx => {
      const amt = Number(tx.amount);
      if (tx.type === '收入' || tx.type === '移轉入') {
        openingBalance += amt;
      } else if (tx.type === '支出' || tx.type === '移轉') {
        openingBalance -= amt;
      }
    });

    // Transactions in this month for closing balance
    const txInMonth = await prisma.cashTransaction.findMany({
      where: {
        accountId: parseInt(accountId),
        transactionDate: { gte: monthStart, lt: monthEnd }
      }
    });

    let closingBalanceSystem = openingBalance;
    txInMonth.forEach(tx => {
      const amt = Number(tx.amount);
      if (tx.type === '收入' || tx.type === '移轉入') {
        closingBalanceSystem += amt;
      } else if (tx.type === '支出' || tx.type === '移轉') {
        closingBalanceSystem -= amt;
      }
    });

    // Generate reconciliation number
    const dateStr = `${year}${String(month).padStart(2, '0')}`;
    const countToday = await prisma.bankReconciliation.count({
      where: { reconciliationNo: { startsWith: `REC-${dateStr}` } }
    });
    const reconciliationNo = `REC-${dateStr}-${String(countToday + 1).padStart(3, '0')}`;

    const reconciliation = await prisma.bankReconciliation.create({
      data: {
        reconciliationNo,
        accountId: parseInt(accountId),
        statementYear: parseInt(year),
        statementMonth: parseInt(month),
        openingBalance,
        closingBalanceSystem,
        closingBalanceBank: 0,
        difference: closingBalanceSystem,
        status: 'draft'
      },
      include: {
        account: {
          select: { id: true, name: true, warehouse: true, type: true, accountCode: true }
        }
      }
    });

    return NextResponse.json({
      ...reconciliation,
      openingBalance: Number(reconciliation.openingBalance),
      closingBalanceSystem: Number(reconciliation.closingBalanceSystem),
      closingBalanceBank: Number(reconciliation.closingBalanceBank),
      difference: Number(reconciliation.difference),
      createdAt: reconciliation.createdAt.toISOString(),
      updatedAt: reconciliation.updatedAt.toISOString(),
      isExisting: false
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

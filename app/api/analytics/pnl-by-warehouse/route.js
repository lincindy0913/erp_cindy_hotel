import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * 從 cashflow（CashTransaction）拉取各館別、按會計科目彙總的損益。
 * 收入含：租屋收入、PMS 收入、出納收入等；支出含：貸款支出、出納支出、費用等。
 * 需提供 startDate、endDate；可選 warehouse 篩選單一館別。
 */
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse') || null;

    if (!startDate || !endDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供 startDate 與 endDate', 400);
    }

    const where = {
      transactionDate: { gte: startDate, lte: endDate },
      type: { in: ['收入', '支出'] },
      isReversal: false,
    };
    if (warehouse) where.warehouse = warehouse;

    const transactions = await prisma.cashTransaction.findMany({
      where,
      select: {
        warehouse: true,
        type: true,
        amount: true,
        fee: true,
        hasFee: true,
        accountingSubject: true,
        categoryId: true,
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            accountingSubjectId: true,
            accountingSubject: {
              select: { id: true, code: true, name: true, category: true, subcategory: true },
            },
          },
        },
      },
      orderBy: [{ transactionDate: 'asc' }],
    });

    // 會計科目顯示：優先 category.accountingSubject，其次 category.name，其次 tx.accountingSubject，最後「未對應會計科目」
    function getSubjectKey(tx) {
      const sub = tx.category?.accountingSubject;
      if (sub) return { code: sub.code, name: sub.name, category: sub.category, subcategory: sub.subcategory };
      if (tx.category?.name) return { code: null, name: tx.category.name, category: null, subcategory: null };
      if (tx.accountingSubject) return { code: null, name: tx.accountingSubject, category: null, subcategory: null };
      return { code: null, name: '未對應會計科目', category: null, subcategory: null };
    }

    const byWarehouse = {};

    for (const tx of transactions) {
      const wh = tx.warehouse ?? '未指定館別';
      if (!byWarehouse[wh]) {
        byWarehouse[wh] = {
          warehouse: wh,
          incomeBySubject: {},
          expenseBySubject: {},
          totalIncome: 0,
          totalExpense: 0,
          totalFees: 0,
        };
      }
      const row = byWarehouse[wh];
      const subject = getSubjectKey(tx);
      const subjectKey = subject.code ? subject.code : subject.name;
      const amt = Number(tx.amount);
      const fee = tx.hasFee ? Number(tx.fee) : 0;

      if (tx.type === '收入') {
        if (!row.incomeBySubject[subjectKey]) row.incomeBySubject[subjectKey] = { subject, amount: 0 };
        row.incomeBySubject[subjectKey].amount += amt;
        row.totalIncome += amt;
      } else if (tx.type === '支出') {
        if (!row.expenseBySubject[subjectKey]) row.expenseBySubject[subjectKey] = { subject, amount: 0 };
        row.expenseBySubject[subjectKey].amount += amt;
        row.totalExpense += amt;
        row.totalFees += fee;
      }
    }

    const list = Object.values(byWarehouse).map((row) => {
      const incomeList = Object.entries(row.incomeBySubject).map(([k, v]) => ({
        ...v,
        amount: Math.round(v.amount * 100) / 100,
      })).sort((a, b) => b.amount - a.amount);
      const expenseList = Object.entries(row.expenseBySubject).map(([k, v]) => ({
        ...v,
        amount: Math.round(v.amount * 100) / 100,
      })).sort((a, b) => b.amount - a.amount);
      return {
        warehouse: row.warehouse,
        incomeBySubject: incomeList,
        expenseBySubject: expenseList,
        totalIncome: Math.round(row.totalIncome * 100) / 100,
        totalExpense: Math.round(row.totalExpense * 100) / 100,
        totalFees: Math.round(row.totalFees * 100) / 100,
        netProfit: Math.round((row.totalIncome - row.totalExpense - row.totalFees) * 100) / 100,
      };
    });

    return NextResponse.json({
      period: { startDate, endDate },
      filterWarehouse: warehouse || null,
      byWarehouse: list,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

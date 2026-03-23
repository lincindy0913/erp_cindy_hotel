import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { buildPnlCashflowWhere, getPnlSubjectKey } from '@/lib/pnl-by-warehouse-shared';
import { resolveCashTransactionSource } from '@/lib/resolve-cash-transaction-source';

export const dynamic = 'force-dynamic';

/**
 * GET 館別損益表「儲存格」鑽取：列出與彙總相同條件下，該館別+科目+收/支的現金流明細。
 * Query: startDate, endDate, warehouse?, flowType=income|expense, subjectKey=（與報表 subjectKey 相同）
 */
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse') || null;
    const flowType = searchParams.get('flowType');
    const subjectKey = searchParams.get('subjectKey');
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '150', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    if (!startDate || !endDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供 startDate 與 endDate', 400);
    }
    if (flowType !== 'income' && flowType !== 'expense') {
      return createErrorResponse('VALIDATION_FAILED', 'flowType 須為 income 或 expense', 400);
    }
    if (subjectKey == null || subjectKey === '') {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供 subjectKey（與館別損益表科目鍵相同）', 400);
    }

    const typeFilter = flowType === 'income' ? '收入' : '支出';
    const where = buildPnlCashflowWhere(startDate, endDate, null);
    where.type = typeFilter;
    // 與報表列一致：__NULL__ = 未指定館別（DB 為 null 或空字串）
    if (warehouse === '__NULL__') {
      where.AND = [{ OR: [{ warehouse: null }, { warehouse: '' }] }];
    } else if (warehouse) {
      where.warehouse = warehouse;
    }

    const transactions = await prisma.cashTransaction.findMany({
      where,
      select: {
        id: true,
        transactionNo: true,
        transactionDate: true,
        type: true,
        warehouse: true,
        amount: true,
        fee: true,
        hasFee: true,
        description: true,
        sourceType: true,
        sourceRecordId: true,
        paymentNo: true,
        accountId: true,
        categoryId: true,
        accountingSubject: true,
        account: { select: { id: true, name: true } },
        category: {
          select: {
            id: true,
            name: true,
            accountingSubject: {
              select: { id: true, code: true, name: true, category: true, subcategory: true },
            },
          },
        },
      },
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
    });

    const matched = transactions.filter((tx) => getPnlSubjectKey(tx) === subjectKey);
    const slice = matched.slice(offset, offset + limit);
    const totalAmount = matched.reduce((sum, tx) => {
      const amt = Number(tx.amount);
      return sum + (Number.isFinite(amt) ? amt : 0);
    }, 0);

    const rows = slice.map((tx) => {
      const src = resolveCashTransactionSource(tx.sourceType, tx.sourceRecordId);
      return {
        id: tx.id,
        transactionNo: tx.transactionNo,
        transactionDate: tx.transactionDate,
        type: tx.type,
        warehouse: tx.warehouse,
        amount: Math.round(Number(tx.amount) * 100) / 100,
        fee: tx.hasFee ? Math.round(Number(tx.fee) * 100) / 100 : 0,
        hasFee: tx.hasFee,
        description: tx.description,
        paymentNo: tx.paymentNo,
        accountId: tx.accountId,
        accountName: tx.account?.name || null,
        sourceType: tx.sourceType,
        sourceRecordId: tx.sourceRecordId,
        source: {
          label: src.label,
          path: src.path,
          hint: src.hint,
        },
      };
    });

    return NextResponse.json({
      traceNote:
        '明細與「分析 → 館別損益表」該儲存格使用相同日期區間、館別與會計科目鍵；金額為現金流交易本體（手續費另列）。',
      period: { startDate, endDate },
      filterWarehouse: warehouse || null,
      flowType,
      subjectKey,
      matchedCount: matched.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      offset,
      limit,
      hasMore: offset + slice.length < matched.length,
      rows,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pms-income/voucher?warehouse=&yearMonth=
 * 產生月結傳票格式資料（依科目代碼彙總）
 */
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse') || '';
    const yearMonth = searchParams.get('yearMonth') || '';

    if (!yearMonth) return createErrorResponse('VALIDATION_FAILED', 'yearMonth 為必填', 400);

    const where = { businessDate: { startsWith: yearMonth } };
    if (warehouse) where.warehouse = warehouse;

    const records = await prisma.pmsIncomeRecord.findMany({
      where,
      select: { entryType: true, accountingCode: true, accountingName: true, pmsColumnName: true, amount: true },
    });

    // 依科目代碼 + 方向彙總
    const map = {};
    for (const r of records) {
      const code = r.accountingCode || '9999';
      const name = r.accountingName || r.pmsColumnName || '未分類';
      const key  = `${r.entryType}|${code}|${name}`;
      if (!map[key]) map[key] = { entryType: r.entryType, accountingCode: code, accountingName: name, total: 0 };
      map[key].total += Number(r.amount);
    }

    // 貸方（收入）在前，借方（付款）在後；同方向依科目代碼排序
    const entries = Object.values(map)
      .filter(e => e.total > 0.01)
      .sort((a, b) => {
        if (a.entryType !== b.entryType) return a.entryType === '貸方' ? -1 : 1;
        return a.accountingCode.localeCompare(b.accountingCode);
      });

    // 驗算借貸平衡
    const creditSum = entries.filter(e => e.entryType === '貸方').reduce((s, e) => s + e.total, 0);
    const debitSum  = entries.filter(e => e.entryType === '借方').reduce((s, e) => s + e.total, 0);

    return NextResponse.json({
      warehouse, yearMonth, entries,
      summary: { creditSum, debitSum, diff: debitSum - creditSum },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

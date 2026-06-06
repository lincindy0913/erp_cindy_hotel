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

    const [records, ccFeeAgg] = await Promise.all([
      prisma.pmsIncomeRecord.findMany({
        where,
        select: { entryType: true, accountingCode: true, accountingName: true, pmsColumnName: true, amount: true },
      }),
      // 信用卡手續費：彙總本月 PmsReservationRecord.ccFeeAmount（已核對 + 已建帳）
      prisma.pmsReservationRecord.aggregate({
        where: {
          ...where,
          ccFeeAmount: { gt: 0 },
          creditCardStatus: { in: ['已核對', '已建帳', 'cc_已建帳'] },
        },
        _sum: { ccFeeAmount: true },
      }),
    ]);

    // 依科目代碼 + 方向彙總
    const map = {};
    for (const r of records) {
      const code = r.accountingCode || '9999';
      const name = r.accountingName || r.pmsColumnName || '未分類';
      const key  = `${r.entryType}|${code}|${name}`;
      if (!map[key]) map[key] = { entryType: r.entryType, accountingCode: code, accountingName: name, total: 0 };
      map[key].total += Number(r.amount);
    }

    // 信用卡手續費分錄：借方 6101 / 貸方 1141 沖回
    const ccFeeTotal = Math.round(Number(ccFeeAgg._sum.ccFeeAmount || 0));
    if (ccFeeTotal > 0) {
      // DR 6101 佣金費用（信用卡手續費）
      const drKey = '借方|6101|信用卡手續費';
      if (!map[drKey]) map[drKey] = { entryType: '借方', accountingCode: '6101', accountingName: '信用卡手續費', total: 0 };
      map[drKey].total += ccFeeTotal;
      // CR 1141 信用卡應收（沖回毛收入→淨收入）
      const crKey = '貸方|1141|信用卡手續費沖回';
      if (!map[crKey]) map[crKey] = { entryType: '貸方', accountingCode: '1141', accountingName: '信用卡手續費沖回', total: 0 };
      map[crKey].total += ccFeeTotal;
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
      ccFeeTotal,
      summary: { creditSum, debitSum, diff: debitSum - creditSum },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

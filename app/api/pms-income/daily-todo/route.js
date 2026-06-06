import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pms-income/daily-todo?warehouse=&yearMonth=
 * 回傳本月各項待辦項目數量，供每日待辦提示列使用
 */
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse') || '';
    const today     = todayStr();
    const thisMonth = today.slice(0, 7);

    const baseWhere  = warehouse ? { warehouse } : {};
    const monthWhere = { ...baseWhere, businessDate: { startsWith: thisMonth } };

    // 退房超過 3 天的基準日
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

    // 訂金待入存簿：不限月份，含「待確認」與「逾期未入」（跨月積壓也要計算）
    const depositPendingWhere = { ...baseWhere, depositIn: { gt: 0 }, depositStatus: { in: ['待確認', '逾期未入'] } };

    const [ccPending, depositPendingRows, depositOverdue, noInvoice, apPending] = await Promise.all([
      // 信用卡有金額但尚未核對（本月）
      prisma.pmsReservationRecord.count({
        where: { ...monthWhere, creditCard: { gt: 0 }, creditCardStatus: { notIn: ['已核對', '已建帳', 'cc_已建帳'] } },
      }),
      // 訂金待入存簿（所有月份，取最早的 businessDate 用於計算積壓天數）
      prisma.pmsReservationRecord.findMany({
        where: depositPendingWhere,
        select: { businessDate: true },
        orderBy: { businessDate: 'asc' },
        take: 500,
      }),
      // 訂金逾期未入（任何月份）
      prisma.pmsReservationRecord.count({
        where: { ...baseWhere, depositIn: { gt: 0 }, depositStatus: '逾期未入' },
      }),
      // 退房超過 3 天且尚未開發票（本月訂房，checkOut 有值且已超過 3 天）
      prisma.pmsReservationRecord.count({
        where: {
          ...monthWhere,
          totalRevenue: { gt: 0 },
          AND: [
            { checkOut: { not: null } },
            { checkOut: { lte: threeDaysAgoStr } },
          ],
          OR: [{ invoiceNo: null }, { invoiceNo: '' }],
        },
      }),
      // 本月廠商應付帳單未結帳
      prisma.vendorItineraryBilling.count({
        where: {
          ...(warehouse ? { warehouse } : {}),
          billingMonth: thisMonth,
          direction: 'AP',
          status: { notIn: ['已結帳'] },
        },
      }),
    ]);

    // 計算最舊待入帳天數
    const depositPending = depositPendingRows.length;
    let depositOldestDays = 0;
    if (depositPendingRows.length > 0) {
      const oldest = depositPendingRows[0].businessDate; // 已排序 asc，第一筆最舊
      const diffMs = new Date(today) - new Date(oldest);
      depositOldestDays = Math.max(0, Math.floor(diffMs / 86400000));
    }

    return NextResponse.json({ today, yearMonth: thisMonth, ccPending, depositPending, depositOldestDays, depositOverdue, noInvoice, apPending });
  } catch (error) {
    return handleApiError(error);
  }
}

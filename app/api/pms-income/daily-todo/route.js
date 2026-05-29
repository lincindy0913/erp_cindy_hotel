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

    const [ccPending, depositPending, depositOverdue, noInvoice, apPending] = await Promise.all([
      // 信用卡有金額但尚未核對
      prisma.pmsReservationRecord.count({
        where: { ...monthWhere, creditCard: { gt: 0 }, creditCardStatus: { notIn: ['已核對', '已建帳', 'cc_已建帳'] } },
      }),
      // 訂金待入存簿（本月 + 狀態待確認）
      prisma.pmsReservationRecord.count({
        where: { ...monthWhere, depositIn: { gt: 0 }, depositStatus: '待確認' },
      }),
      // 訂金逾期未入（任何月份）
      prisma.pmsReservationRecord.count({
        where: { ...baseWhere, depositIn: { gt: 0 }, depositStatus: '逾期未入' },
      }),
      // 本月訂房無發票號碼
      prisma.pmsReservationRecord.count({
        where: { ...monthWhere, totalRevenue: { gt: 0 }, OR: [{ invoiceNo: null }, { invoiceNo: '' }] },
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

    return NextResponse.json({ today, yearMonth: thisMonth, ccPending, depositPending, depositOverdue, noInvoice, apPending });
  } catch (error) {
    return handleApiError(error);
  }
}

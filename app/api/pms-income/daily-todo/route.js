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

    // 上月月份（OTA 帳單對帳判斷）
    const lastMonthDate  = new Date(today);
    lastMonthDate.setDate(1);
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonthStr   = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthYear  = lastMonthDate.getFullYear();
    const lastMonthMonth = lastMonthDate.getMonth() + 1;

    const [ccPending, depositPendingRows, depositOverdue, noInvoice, apPending, otaUnrecon, apOverdue,
           lastMonthOtaSources, lastMonthReconSources, lastMonthClosed, apOverdueItems] = await Promise.all([
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
      // OTA 訂房本月有收入但佣金尚未記錄（commission = 0）
      prisma.pmsReservationRecord.count({
        where: {
          ...monthWhere,
          source: { startsWith: 'OTA-' },
          totalRevenue: { gt: 0 },
          commission: 0,
        },
      }),
      // 應付付款單已逾期（dueDate < today 且狀態仍在待出納）
      prisma.paymentOrder.count({
        where: {
          ...(warehouse ? { warehouse } : {}),
          status: '待出納',
          dueDate: { not: null, lt: today },
        },
      }),
      // 上月各 OTA 來源是否有收入（groupBy source，取得各平台清單）
      prisma.pmsReservationRecord.groupBy({
        by: ['source'],
        where: {
          ...baseWhere,
          source: { startsWith: 'OTA-' },
          totalRevenue: { gt: 0 },
          businessDate: { startsWith: lastMonthStr },
        },
      }),
      // 上月已建立對帳記錄的 OTA 來源（distinct otaSource）
      prisma.pmsOtaReconLog.findMany({
        where: {
          ...(warehouse ? { warehouse } : {}),
          billingMonth: lastMonthStr,
        },
        select: { otaSource: true },
        distinct: ['otaSource'],
      }),
      // 上月月結是否完成（已結帳或已鎖定才提醒對帳）
      prisma.monthEndStatus.findFirst({
        where: {
          year: lastMonthYear,
          month: lastMonthMonth,
          status: { in: ['已結帳', '已鎖定'] },
          ...(warehouse ? { warehouse } : {}),
        },
        select: { id: true },
      }),
      // 逾期應付帳款詳情（前 5 筆，供待辦列展開顯示）
      prisma.paymentOrder.findMany({
        where: {
          ...(warehouse ? { warehouse } : {}),
          status: '待出納',
          dueDate: { not: null, lt: today },
        },
        select: { id: true, supplierName: true, netAmount: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
        take: 5,
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

    // OTA 上月帳單未對帳：條件 = 上月已月結 + 有 OTA 收入來源 + 該來源無對帳記錄
    const reconSourceSet  = new Set(lastMonthReconSources.map(r => r.otaSource));
    const unreconSources  = lastMonthOtaSources.filter(s => !reconSourceSet.has(s.source));
    // 只有上月月結完成後才顯示提醒（月結前尚在進行中，不需催）
    const otaBillingUnrecon = lastMonthClosed ? unreconSources.length : 0;

    // 逾期應付帳款詳情
    const apOverdueDetail = apOverdueItems.map(o => ({
      supplierName: o.supplierName || '未知廠商',
      amount: Number(o.netAmount),
      daysOverdue: Math.max(0, Math.floor((new Date(today) - new Date(o.dueDate)) / 86400000)),
    }));

    return NextResponse.json({ today, yearMonth: thisMonth, ccPending, depositPending, depositOldestDays, depositOverdue, noInvoice, apPending, otaUnrecon, apOverdue, otaBillingUnrecon, otaBillingMonth: lastMonthStr, apOverdueDetail });
  } catch (error) {
    return handleApiError(error);
  }
}

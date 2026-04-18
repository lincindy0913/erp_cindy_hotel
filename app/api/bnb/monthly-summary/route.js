/**
 * GET /api/bnb/monthly-summary
 *
 * 從 BnbBookingRecord 自動彙整月收入，並與進貨/費用資料合併為收支總表
 *
 * Query:
 *   year      — 年份（YYYY）
 *   warehouse — 館別（預設不限）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year      = searchParams.get('year') || new Date().getFullYear().toString();
    const warehouse = searchParams.get('warehouse') || '';

    // ── 1. 訂房記錄月彙整 ──────────────────────────────────────
    const bookingWhere = {
      importMonth: { startsWith: year },
      status: { notIn: ['已刪除'] },
    };
    if (warehouse) bookingWhere.warehouse = warehouse;

    const bookings = await prisma.bnbBookingRecord.findMany({
      where: bookingWhere,
      select: {
        importMonth: true,
        roomCharge: true, otherCharge: true,
        payDeposit: true, payTransfer: true, payCard: true, payCash: true, payVoucher: true,
        cardFee: true, status: true,
        paymentLocked: true, paymentFilled: true,
      },
    });

    // ── 2. 月報補充欄位（旅宿網申報）──────────────────────────
    const reportWhere = { reportMonth: { startsWith: year } };
    if (warehouse) reportWhere.warehouse = warehouse;
    const reports = await prisma.bnbMonthlyReport.findMany({ where: reportWhere });
    const reportMap = new Map(reports.map(r => [r.reportMonth, r]));

    // ── 3. 進貨支出（民宿館別，已入庫）────────────────────────
    const purchaseWhere = {
      purchaseDate: { gte: `${year}-01-01`, lte: `${year}-12-31` },
      status: { in: ['已入庫', '已完成'] },
    };
    if (warehouse) purchaseWhere.warehouse = warehouse;
    const purchases = await prisma.purchaseMaster.findMany({
      where: purchaseWhere,
      select: { purchaseDate: true, totalAmount: true },
    });

    // ── 4. 固定費用記錄（已確認）──────────────────────────────
    const expWhere = {
      expenseMonth: { gte: `${year}-01`, lte: `${year}-12` },
      status: '已確認',
    };
    if (warehouse) expWhere.warehouse = warehouse;
    const expenses = await prisma.commonExpenseRecord.findMany({
      where: expWhere,
      select: { expenseMonth: true, totalDebit: true },
    });

    // ── 5. 逐月彙整 ───────────────────────────────────────────
    const monthlyMap = {};
    const ensureMonth = (m) => {
      if (!monthlyMap[m]) monthlyMap[m] = {
        month: m,
        rooms: 0, totalRevenue: 0, otherCharge: 0,
        payDeposit: 0, payTransfer: 0, payCard: 0, payCash: 0, payVoucher: 0, cardFee: 0,
        purchaseExpense: 0, fixedExpense: 0,
        otherIncome: 0,
        lockedCount: 0, filledCount: 0,
      };
    };

    for (const b of bookings) {
      ensureMonth(b.importMonth);
      const m = monthlyMap[b.importMonth];
      m.rooms++;
      m.totalRevenue  += Number(b.roomCharge);
      m.otherCharge   += Number(b.otherCharge);
      m.payDeposit    += Number(b.payDeposit);
      m.payTransfer   += Number(b.payTransfer);
      m.payCard       += Number(b.payCard);
      m.payCash       += Number(b.payCash);
      m.payVoucher    += Number(b.payVoucher);
      m.cardFee       += Number(b.cardFee);
      if (b.paymentLocked) m.lockedCount++;
      if (b.paymentFilled) m.filledCount++;
    }

    for (const p of purchases) {
      const m = p.purchaseDate.slice(0, 7);
      ensureMonth(m);
      monthlyMap[m].purchaseExpense += Number(p.totalAmount);
    }

    for (const e of expenses) {
      const m = e.expenseMonth; // already YYYY-MM
      ensureMonth(m);
      monthlyMap[m].fixedExpense += Number(e.totalDebit);
    }

    // 加入月報補充資訊
    for (const [month, rpt] of reportMap) {
      ensureMonth(month);
      monthlyMap[month].otherIncome      = Number(rpt.otherIncome || 0);
      monthlyMap[month].otherIncomeNote  = rpt.otherIncomeNote || '';
      monthlyMap[month].cardTotal        = rpt.cardTotal ? Number(rpt.cardTotal) : null;
      monthlyMap[month].roomPriceTotal   = rpt.roomPriceTotal ? Number(rpt.roomPriceTotal) : null;
      monthlyMap[month].subsidizedRooms  = rpt.subsidizedRooms ?? null;
      monthlyMap[month].avgRoomRate      = rpt.avgRoomRate ? Number(rpt.avgRoomRate) : null;
      monthlyMap[month].monthlyRoomCount = rpt.monthlyRoomCount ?? null;
      monthlyMap[month].roomSuppliesCost = rpt.roomSuppliesCost ? Number(rpt.roomSuppliesCost) : null;
      monthlyMap[month].fbExpense        = rpt.fbExpense ? Number(rpt.fbExpense) : null;
      monthlyMap[month].staffCount       = rpt.staffCount ?? null;
      monthlyMap[month].salary           = rpt.salary ? Number(rpt.salary) : null;
      monthlyMap[month].businessSource   = rpt.businessSource || '';
      monthlyMap[month].fitGuestCount    = rpt.fitGuestCount ?? null;
      monthlyMap[month].reportId         = rpt.id;
    }

    const rows = Object.values(monthlyMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        netRevenue:   m.totalRevenue + m.otherCharge - m.cardFee,
        totalExpense: m.purchaseExpense + m.fixedExpense,
        netProfit:    m.totalRevenue + m.otherCharge + m.otherIncome - m.cardFee - m.purchaseExpense - m.fixedExpense,
      }));

    // ── 6. 固定費用輔助資訊（前端連結／缺資料提示）──────────────────
    const pendingWhere = {
      expenseMonth: { gte: `${year}-01`, lte: `${year}-12` },
      status: { notIn: ['已確認', '已作廢'] },
    };
    if (warehouse) pendingWhere.warehouse = warehouse;
    const pendingFixedCount = await prisma.commonExpenseRecord.count({ where: pendingWhere });

    const monthsWithZeroFixed = rows
      .filter((r) =>
        Number(r.fixedExpense) === 0 &&
        (r.rooms > 0 || Number(r.totalRevenue) > 0)
      )
      .map((r) => r.month);

    return NextResponse.json({
      year,
      rows,
      fixedExpenseHelp: {
        pendingFixedCount,
        monthsWithZeroFixed,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

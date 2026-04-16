/**
 * GET /api/analytics/utility-occupancy
 *
 * 館別 + 民國年：合併水電帳單與 PMS 住宿批次（住宿人數、入住間數），供年度分析與決策分析頁使用。
 *
 * Query:
 *   warehouse — 館別（須與水電單、PMS 匯入的館別一致）
 *   rocYear   — 民國年（與 utility_bill_records.bill_year 一致）
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

function calcTotalFromJson(summaryJson, billType) {
  try {
    const raw = typeof summaryJson === 'string' ? JSON.parse(summaryJson) : summaryJson;
    const items = Array.isArray(raw) ? raw : [raw];
    return items.reduce((sum, item) => {
      const v = billType === '電費'
        ? (item.應繳總金額 || item.電費金額 || '0')
        : (item.總金額 || '0');
      return sum + (parseInt(String(v).replace(/,/g, ''), 10) || 0);
    }, 0);
  } catch {
    return 0;
  }
}

/** 帳單內所有表號/水號的使用度數加總 */
function sumUsageFromJson(summaryJson, billType) {
  try {
    const raw = typeof summaryJson === 'string' ? JSON.parse(summaryJson) : summaryJson;
    const items = Array.isArray(raw) ? raw : [raw];
    return items.reduce((sum, item) => {
      const rawValue = billType === '電費'
        ? (item.使用度數 || '0')
        : (item.本期實用度數 || item.用水度數 || '0');
      return sum + (parseInt(String(rawValue).replace(/,/g, ''), 10) || 0);
    }, 0);
  } catch {
    return 0;
  }
}

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = (searchParams.get('warehouse') || '').trim();
    const rocYear = parseInt(searchParams.get('rocYear'), 10);

    if (!warehouse) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供 warehouse（館別）', 400);
    }
    if (!Number.isFinite(rocYear) || rocYear < 1 || rocYear > 200) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供有效的 rocYear（民國年）', 400);
    }

    const whWhere = { warehouse };
    const wf = applyWarehouseFilter(auth.session, whWhere);
    if (!wf.ok) return wf.response;

    const adYear = rocYear + 1911;
    const startDate = `${adYear}-01-01`;
    const endDate = `${adYear}-12-31`;

    const [elecBills, waterBills, pmsBatches] = await Promise.all([
      prisma.utilityBillRecord.findMany({
        where: { ...whWhere, billYear: rocYear, billType: '電費' },
        select: { billMonth: true, summaryJson: true, totalAmount: true },
      }),
      prisma.utilityBillRecord.findMany({
        where: { ...whWhere, billYear: rocYear, billType: '水費' },
        select: { billMonth: true, summaryJson: true, totalAmount: true },
      }),
      prisma.pmsImportBatch.findMany({
        where: {
          warehouse,
          businessDate: { gte: startDate, lte: endDate },
        },
        select: {
          businessDate: true,
          guestCount: true,
          occupiedRooms: true,
          roomCount: true,
        },
        take: 20000,
      }),
    ]);

    const elecByMonth = Object.fromEntries(elecBills.map((r) => [r.billMonth, r]));
    const waterByMonth = Object.fromEntries(waterBills.map((r) => [r.billMonth, r]));

    const pmsByMonth = {};
    for (const b of pmsBatches) {
      const ym = b.businessDate ? b.businessDate.substring(0, 7) : '';
      if (!ym || !ym.startsWith(String(adYear))) continue;
      const m = parseInt(ym.slice(5, 7), 10);
      if (m < 1 || m > 12) continue;
      if (!pmsByMonth[m]) {
        pmsByMonth[m] = { guestCount: 0, occupiedRooms: 0, roomCount: 0, dayCount: 0 };
      }
      pmsByMonth[m].guestCount += Number(b.guestCount) || 0;
      pmsByMonth[m].occupiedRooms += Number(b.occupiedRooms) || 0;
      pmsByMonth[m].roomCount += Number(b.roomCount) || 0;
      pmsByMonth[m].dayCount += 1;
    }

    const months = [];
    let yElecAmt = 0;
    let yElecUsage = 0;
    let yWaterAmt = 0;
    let yWaterUsage = 0;
    let yGuests = 0;
    let yOccRooms = 0;

    for (let m = 1; m <= 12; m++) {
      const er = elecByMonth[m];
      const wr = waterByMonth[m];
      const elecAmount = er
        ? (er.totalAmount != null ? Number(er.totalAmount) : calcTotalFromJson(er.summaryJson, '電費'))
        : 0;
      const waterAmount = wr
        ? (wr.totalAmount != null ? Number(wr.totalAmount) : calcTotalFromJson(wr.summaryJson, '水費'))
        : 0;
      const elecUsage = er ? sumUsageFromJson(er.summaryJson, '電費') : 0;
      const waterUsage = wr ? sumUsageFromJson(wr.summaryJson, '水費') : 0;

      const p = pmsByMonth[m] || { guestCount: 0, occupiedRooms: 0, roomCount: 0, dayCount: 0 };
      const guestCount = p.guestCount;
      const occupiedRooms = p.occupiedRooms;

      const elecPerGuest = guestCount > 0 ? elecAmount / guestCount : null;
      const elecPerOccRoom = occupiedRooms > 0 ? elecAmount / occupiedRooms : null;
      const elecUsagePerGuest = guestCount > 0 ? elecUsage / guestCount : null;

      yElecAmt += elecAmount;
      yWaterAmt += waterAmount;
      yElecUsage += elecUsage;
      yWaterUsage += waterUsage;
      yGuests += guestCount;
      yOccRooms += occupiedRooms;

      months.push({
        month: m,
        elecAmount,
        elecUsage,
        waterAmount,
        waterUsage,
        guestCount,
        occupiedRooms,
        roomCountSum: p.roomCount,
        pmsDayCount: p.dayCount,
        elecPerGuest,
        elecPerOccRoom,
        elecUsagePerGuest,
      });
    }

    const yearElecPerGuest = yGuests > 0 ? yElecAmt / yGuests : null;
    const yearElecPerOccRoom = yOccRooms > 0 ? yElecAmt / yOccRooms : null;

    return NextResponse.json({
      warehouse,
      rocYear,
      adYear,
      months,
      yearTotals: {
        elecAmount: yElecAmt,
        elecUsage: yElecUsage,
        waterAmount: yWaterAmt,
        waterUsage: yWaterUsage,
        guestCount: yGuests,
        occupiedRooms: yOccRooms,
        elecPerGuest: yearElecPerGuest,
        elecPerOccRoom: yearElecPerOccRoom,
      },
      note:
        '住宿人數、入住間數為 PMS 日匯入欄位之月加總（guestCount、occupiedRooms）。館別須與水電單、PMS 一致。',
    });
  } catch (e) {
    return handleApiError(e);
  }
}

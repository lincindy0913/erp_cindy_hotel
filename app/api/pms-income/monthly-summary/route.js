import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET ?year=YYYY[&month=M]
 *
 * Single month  → one groupBy query, return one summary object.
 * All 12 months → one groupBy for the full year, split in JS, return array[12].
 *
 * Replaces the old approach of 12 sequential findMany + JS aggregation.
 */
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PMS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!year) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '年份為必填', 400);
    }

    const yearNum = parseInt(year);
    if (Number.isNaN(yearNum)) {
      return createErrorResponse('VALIDATION_FAILED', '年份格式無效', 400);
    }

    if (month) {
      const monthNum = parseInt(month);
      const monthStr = String(monthNum).padStart(2, '0');
      const groups = await prisma.pmsIncomeRecord.groupBy({
        by: ['warehouse', 'businessDate', 'entryType', 'accountingCode', 'accountingName'],
        where: { businessDate: { startsWith: `${yearNum}-${monthStr}` } },
        _sum: { amount: true },
      });
      return NextResponse.json(buildMonthSummary(yearNum, monthNum, groups));
    }

    // Full year: one DB round-trip, then split by month in JS
    const groups = await prisma.pmsIncomeRecord.groupBy({
      by: ['warehouse', 'businessDate', 'entryType', 'accountingCode', 'accountingName'],
      where: { businessDate: { startsWith: `${yearNum}-` } },
      _sum: { amount: true },
    });

    const summaries = Array.from({ length: 12 }, (_, i) =>
      buildMonthSummary(yearNum, i + 1, groups)
    );
    return NextResponse.json(summaries);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Build one month's summary from pre-fetched groupBy rows.
 * No DB access — pure JS aggregation over the already-grouped data.
 */
function buildMonthSummary(year, month, allGroups) {
  const monthStr = String(month).padStart(2, '0');
  const prefix = `${year}-${monthStr}`;

  let total = 0;
  const byWarehouse = {};
  const byAccountingCode = {};
  const importedDaysSet = {};

  for (const g of allGroups) {
    if (!g.businessDate.startsWith(prefix)) continue;

    const amt = Number(g._sum.amount ?? 0);
    const sign = g.entryType === '貸方' ? 1 : -1;
    total += amt * sign;

    // byWarehouse
    if (!byWarehouse[g.warehouse]) {
      byWarehouse[g.warehouse] = { credit: 0, debit: 0, net: 0, days: new Set() };
    }
    if (g.entryType === '貸方') {
      byWarehouse[g.warehouse].credit += amt;
    } else {
      byWarehouse[g.warehouse].debit += amt;
    }
    byWarehouse[g.warehouse].net += amt * sign;
    byWarehouse[g.warehouse].days.add(g.businessDate);

    // byAccountingCode
    const codeKey = `${g.accountingCode}|${g.accountingName}`;
    if (!byAccountingCode[codeKey]) {
      byAccountingCode[codeKey] = {
        accountingCode: g.accountingCode,
        accountingName: g.accountingName,
        credit: 0, debit: 0, net: 0,
      };
    }
    if (g.entryType === '貸方') {
      byAccountingCode[codeKey].credit += amt;
    } else {
      byAccountingCode[codeKey].debit += amt;
    }
    byAccountingCode[codeKey].net += amt * sign;

    // importedDaysSet
    if (!importedDaysSet[g.warehouse]) importedDaysSet[g.warehouse] = new Set();
    importedDaysSet[g.warehouse].add(g.businessDate);
  }

  const daysInMonth = new Date(year, month, 0).getDate();

  const allDays = new Set();
  for (const s of Object.values(importedDaysSet)) for (const d of s) allDays.add(d);

  const byWarehouseResult = {};
  for (const [wh, v] of Object.entries(byWarehouse)) {
    byWarehouseResult[wh] = {
      credit: v.credit,
      debit: v.debit,
      net: v.net,
      importedDays: v.days.size,
    };
  }

  const missingDays = {};
  for (const wh of Object.keys(importedDaysSet)) {
    const imported = importedDaysSet[wh];
    const missing = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
      if (!imported.has(ds)) missing.push(ds);
    }
    missingDays[wh] = missing;
  }

  return {
    year,
    month,
    total,
    byWarehouse: byWarehouseResult,
    byAccountingCode: Object.values(byAccountingCode),
    importedDays: allDays.size,
    totalDays: daysInMonth,
    missingDays,
  };
}

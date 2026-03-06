import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: Return monthly summary
// Params: year (required), month (optional)
// If month provided: single month detail
// If no month: array of 12 monthly summaries for the year
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

    if (month) {
      // Single month detail
      const monthNum = parseInt(month);
      const summary = await getMonthSummary(yearNum, monthNum);
      return NextResponse.json(summary);
    } else {
      // All 12 months for the year
      const summaries = [];
      for (let m = 1; m <= 12; m++) {
        const summary = await getMonthSummary(yearNum, m);
        summaries.push(summary);
      }
      return NextResponse.json(summaries);
    }
  } catch (error) {
    return handleApiError(error);
  }
}

async function getMonthSummary(year, month) {
  const monthStr = String(month).padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;

  // Get all records for this month
  const records = await prisma.pmsIncomeRecord.findMany({
    where: {
      businessDate: { startsWith: datePrefix }
    },
    select: {
      warehouse: true,
      businessDate: true,
      entryType: true,
      amount: true,
      accountingCode: true,
      accountingName: true
    }
  });

  // Calculate totals
  let total = 0;
  const byWarehouse = {};
  const byAccountingCode = {};
  const importedDaysSet = {};

  for (const r of records) {
    const amt = Number(r.amount);
    const sign = r.entryType === '貸方' ? 1 : -1;
    total += amt * sign;

    // By warehouse
    if (!byWarehouse[r.warehouse]) {
      byWarehouse[r.warehouse] = { credit: 0, debit: 0, net: 0, days: new Set() };
    }
    if (r.entryType === '貸方') {
      byWarehouse[r.warehouse].credit += amt;
    } else {
      byWarehouse[r.warehouse].debit += amt;
    }
    byWarehouse[r.warehouse].net += amt * sign;
    byWarehouse[r.warehouse].days.add(r.businessDate);

    // By accounting code
    const codeKey = `${r.accountingCode}|${r.accountingName}`;
    if (!byAccountingCode[codeKey]) {
      byAccountingCode[codeKey] = { accountingCode: r.accountingCode, accountingName: r.accountingName, credit: 0, debit: 0, net: 0 };
    }
    if (r.entryType === '貸方') {
      byAccountingCode[codeKey].credit += amt;
    } else {
      byAccountingCode[codeKey].debit += amt;
    }
    byAccountingCode[codeKey].net += amt * sign;

    // Track imported days per warehouse
    if (!importedDaysSet[r.warehouse]) {
      importedDaysSet[r.warehouse] = new Set();
    }
    importedDaysSet[r.warehouse].add(r.businessDate);
  }

  // Calculate days in month
  const daysInMonth = new Date(year, month, 0).getDate();

  // Get all imported days (unique business dates)
  const allDays = new Set();
  for (const wh of Object.values(importedDaysSet)) {
    for (const d of wh) allDays.add(d);
  }

  // Serialize warehouse data (convert Sets to counts)
  const byWarehouseResult = {};
  for (const [wh, data] of Object.entries(byWarehouse)) {
    byWarehouseResult[wh] = {
      credit: data.credit,
      debit: data.debit,
      net: data.net,
      importedDays: data.days.size
    };
  }

  // Missing days per warehouse
  const warehouses = Object.keys(importedDaysSet);
  const missingDays = {};
  for (const wh of warehouses) {
    const importedDates = importedDaysSet[wh];
    const missing = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
      if (!importedDates.has(dateStr)) {
        missing.push(dateStr);
      }
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
    missingDays
  };
}

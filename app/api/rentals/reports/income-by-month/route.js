import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

/**
 * GET ?year=2025&propertyId=&category=&startDate=&endDate=
 * category: 類別 (unitNo)；__RENTAL_CAT_EMPTY__ = 未填類別
 * Returns pivot: 房號(property label) x 1..12 months, total.
 */
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const propertyIdParam = searchParams.get('propertyId');
    const propertyIdFilter = propertyIdParam ? parseInt(propertyIdParam, 10) : null;
    const categoryParam = searchParams.get('category');

    // Determine year(s) to query
    let yearFilter;
    let startMonth = 1;
    let endMonth = 12;
    let displayYear;

    if (startDate && endDate) {
      if (startDate > endDate) {
        return createErrorResponse('VALIDATION_FAILED', '結束日期不可早於開始日期', 400);
      }
      // Date range mode: extract year/month from dates
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const sYear = sDate.getFullYear();
      const eYear = eDate.getFullYear();
      displayYear = sYear === eYear ? sYear : `${sYear}-${eYear}`;
      yearFilter = sYear === eYear ? { equals: sYear } : { gte: sYear, lte: eYear };
      if (sYear === eYear) {
        startMonth = sDate.getMonth() + 1;
        endMonth = eDate.getMonth() + 1;
      }
    } else {
      const y = year ? parseInt(year, 10) : new Date().getFullYear();
      if (Number.isNaN(y)) {
        return createErrorResponse('VALIDATION_FAILED', 'Invalid year', 400);
      }
      yearFilter = { equals: y };
      displayYear = y;
    }

    let propertyIdsInCategory = null;
    if (categoryParam) {
      const rows = await prisma.rentalProperty.findMany({
        where: { category: categoryParam.trim() },
        select: { id: true }
      });
      propertyIdsInCategory = rows.map((r) => r.id);
      if (propertyIdsInCategory.length === 0) {
        return NextResponse.json({ year: displayYear, rows: [] });
      }
    }

    const incomeWhere = {
      ...(yearFilter.equals != null ? { incomeYear: yearFilter.equals } : { incomeYear: { gte: yearFilter.gte, lte: yearFilter.lte } }),
      ...(propertyIdsInCategory
        ? { propertyId: { in: propertyIdsInCategory } }
        : propertyIdFilter
          ? { propertyId: propertyIdFilter }
          : {})
    };
    const utilityWhere = { ...incomeWhere };

    const today = todayStr();
    const [incomes, utilityIncomes] = await Promise.all([
      prisma.rentalIncome.findMany({
        where: incomeWhere,
        select: {
          propertyId: true,
          incomeMonth: true,
          actualAmount: true,
          expectedAmount: true,
          status: true,
          dueDate: true,
          isSplitAllocation: true,
          property: { select: { id: true, name: true, buildingName: true, unitNo: true, address: true } },
          tenant: { select: { fullName: true, companyName: true, tenantType: true } }
        },
        orderBy: [{ propertyId: 'asc' }, { incomeMonth: 'asc' }]
      }),
      prisma.rentalUtilityIncome.findMany({
        where: utilityWhere,
        select: { propertyId: true, incomeMonth: true, actualAmount: true, status: true }
      })
    ]);

    const propertyIds = new Set([
      ...incomes.map((i) => i.propertyId),
      ...utilityIncomes.map((u) => u.propertyId)
    ]);
    const propertyList =
      propertyIds.size > 0
        ? await prisma.rentalProperty.findMany({
            where: { id: { in: Array.from(propertyIds) } },
            select: { id: true, name: true, buildingName: true, unitNo: true, address: true, sortOrder: true, asset: { select: { sortOrder: true } } }
          })
        : [];

    const propLabel = (p) => p ? (p.name || [p.buildingName, p.unitNo].filter(Boolean).join(' ') || p.address || `物業#${p.id}`) : '';
    const byProperty = new Map();
    for (const p of propertyList) {
      const emptyStatus = {};
      for (let m = 1; m <= 12; m++) emptyStatus[m] = 'empty';
      byProperty.set(p.id, {
        propertyId: p.id,
        propertyLabel: propLabel(p),
        sortOrder: p.asset?.sortOrder ?? p.sortOrder ?? null,
        tenantName: null,
        months: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
        monthsExpected: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
        monthsSplit: {},
        monthStatus: { ...emptyStatus },
        total: 0
      });
    }
    for (const i of incomes) {
      const row = byProperty.get(i.propertyId);
      if (!row) continue;
      const paid = i.status === 'completed' || i.status === 'partial';
      const amount = paid ? Number(i.actualAmount ?? 0) : 0;
      row.months[i.incomeMonth] = (row.months[i.incomeMonth] || 0) + amount;
      row.monthsExpected[i.incomeMonth] = (row.monthsExpected[i.incomeMonth] || 0) + Number(i.expectedAmount ?? 0);
      if (i.isSplitAllocation) row.monthsSplit[i.incomeMonth] = true;
      row.total += amount;
      // Compute cell status: overdue > partial > completed > pending > empty
      const cellStatus = i.status === 'completed' ? 'completed'
        : i.status === 'partial' ? 'partial'
        : (i.dueDate && i.dueDate < today) ? 'overdue'
        : 'pending';
      const prev = row.monthStatus[i.incomeMonth];
      const priority = { empty: 0, pending: 1, completed: 2, partial: 3, overdue: 4 };
      if ((priority[cellStatus] || 0) > (priority[prev] || 0)) {
        row.monthStatus[i.incomeMonth] = cellStatus;
      }
      if (!row.tenantName && i.tenant) {
        row.tenantName = i.tenant.tenantType === 'company' ? i.tenant.companyName : i.tenant.fullName;
      }
    }
    for (const u of utilityIncomes) {
      const row = byProperty.get(u.propertyId);
      if (!row) continue;
      const amount = (u.status === 'completed') ? Number(u.actualAmount ?? 0) : 0;
      row.months[u.incomeMonth] = (row.months[u.incomeMonth] || 0) + amount;
      row.total += amount;
    }

    // 查詢每個物業目前是否有生效或待審核合約，以標記已退租
    const activeContractMap = new Map();
    if (propertyIds.size > 0) {
      const activeContracts = await prisma.rentalContract.findMany({
        where: {
          propertyId: { in: Array.from(propertyIds) },
          status: { in: ['active', 'pending'] }
        },
        select: { propertyId: true }
      });
      for (const c of activeContracts) activeContractMap.set(c.propertyId, true);
    }

    const rows = Array.from(byProperty.values())
      .map(r => ({
        ...r,
        months: r.months, monthsExpected: r.monthsExpected, monthStatus: r.monthStatus,
        isTerminated: !activeContractMap.has(r.propertyId)
      }))
      .filter(r => r.total > 0 || r.tenantName)
      .sort((a, b) => {
        if (a.isTerminated !== b.isTerminated) return a.isTerminated ? 1 : -1;
        const sa = a.sortOrder ?? 999999;
        const sb = b.sortOrder ?? 999999;
        if (sa !== sb) return sa - sb;
        return (a.propertyLabel || '').localeCompare(b.propertyLabel || '');
      });

    return NextResponse.json({ year: displayYear, rows });
  } catch (error) {
    console.error('GET /api/rentals/reports/income-by-month error:', error.message || error);
    return handleApiError(error);
  }
}

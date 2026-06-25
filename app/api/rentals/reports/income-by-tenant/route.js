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
 *
 * 與 income-by-month 不同：本報表以「物業 × 租客」為一列。
 * 同一物業若在同年度有不同租客（換租客 / 退租新簽），會拆成多列，
 * 各自顯示其承租期間（最早～最晚有收款記錄的月份）與各月收費。
 *
 * 租客來源為 RentalIncome.tenantId（產生收款紀錄當下的快照），
 * 因此即使合約之後換了租客，本報表仍能還原各期間實際承租人。
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

    let yearFilter;
    let displayYear;

    if (startDate && endDate) {
      if (startDate > endDate) {
        return createErrorResponse('VALIDATION_FAILED', '結束日期不可早於開始日期', 400);
      }
      const sYear = new Date(startDate).getFullYear();
      const eYear = new Date(endDate).getFullYear();
      displayYear = sYear === eYear ? sYear : `${sYear}-${eYear}`;
      yearFilter = sYear === eYear ? { equals: sYear } : { gte: sYear, lte: eYear };
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
        select: { id: true },
      });
      propertyIdsInCategory = rows.map((r) => r.id);
      if (propertyIdsInCategory.length === 0) {
        return NextResponse.json({ year: displayYear, rows: [] });
      }
    }

    const incomeWhere = {
      ...(yearFilter.equals != null
        ? { incomeYear: yearFilter.equals }
        : { incomeYear: { gte: yearFilter.gte, lte: yearFilter.lte } }),
      ...(propertyIdsInCategory
        ? { propertyId: { in: propertyIdsInCategory } }
        : propertyIdFilter
          ? { propertyId: propertyIdFilter }
          : {}),
    };

    const today = todayStr();
    const [incomes, utilityIncomes] = await Promise.all([
      prisma.rentalIncome.findMany({
        where: incomeWhere,
        select: {
          propertyId: true,
          tenantId: true,
          incomeMonth: true,
          actualAmount: true,
          expectedAmount: true,
          status: true,
          dueDate: true,
          isSplitAllocation: true,
          tenant: { select: { id: true, fullName: true, companyName: true, tenantType: true } },
        },
        orderBy: [{ propertyId: 'asc' }, { incomeMonth: 'asc' }],
      }),
      prisma.rentalUtilityIncome.findMany({
        where: { ...incomeWhere },
        select: { propertyId: true, incomeMonth: true, actualAmount: true, status: true },
      }),
    ]);

    const propertyIds = new Set([
      ...incomes.map((i) => i.propertyId),
      ...utilityIncomes.map((u) => u.propertyId),
    ]);
    const propertyList =
      propertyIds.size > 0
        ? await prisma.rentalProperty.findMany({
            where: { id: { in: Array.from(propertyIds) } },
            select: {
              id: true, name: true, buildingName: true, unitNo: true, address: true,
              sortOrder: true, asset: { select: { sortOrder: true } },
            },
          })
        : [];

    const propLabel = (p) =>
      p ? (p.name || [p.buildingName, p.unitNo].filter(Boolean).join(' ') || p.address || `物業#${p.id}`) : '';
    const propMap = new Map();
    for (const p of propertyList) {
      propMap.set(p.id, {
        label: propLabel(p),
        sortOrder: p.asset?.sortOrder ?? p.sortOrder ?? null,
      });
    }

    const emptyMonths = () => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 });
    const emptyStatus = () => {
      const s = {};
      for (let m = 1; m <= 12; m++) s[m] = 'empty';
      return s;
    };

    // key = propertyId__tenantId
    const byKey = new Map();
    // propertyId_month -> tenantId（供水電費歸屬使用，取該月第一位有收款的租客）
    const pmTenant = new Map();

    const ensureRow = (propertyId, tenantId, tenant) => {
      const key = `${propertyId}__${tenantId}`;
      let row = byKey.get(key);
      if (!row) {
        const prop = propMap.get(propertyId);
        const tenantName = tenant
          ? (tenant.tenantType === 'company' ? tenant.companyName : tenant.fullName)
          : '（未對應租客）';
        row = {
          key,
          propertyId,
          propertyLabel: prop?.label || `物業#${propertyId}`,
          sortOrder: prop?.sortOrder ?? null,
          tenantId,
          tenantName,
          months: emptyMonths(),
          monthsExpected: emptyMonths(),
          monthsSplit: {},
          monthStatus: emptyStatus(),
          total: 0,
          startMonth: null,
          endMonth: null,
        };
        byKey.set(key, row);
      }
      return row;
    };

    const priority = { empty: 0, pending: 1, completed: 2, partial: 3, overdue: 4 };

    for (const i of incomes) {
      const row = ensureRow(i.propertyId, i.tenantId, i.tenant);
      const paid = i.status === 'completed' || i.status === 'partial';
      const amount = paid ? Number(i.actualAmount ?? 0) : 0;
      const m = i.incomeMonth;
      row.months[m] = (row.months[m] || 0) + amount;
      row.monthsExpected[m] = (row.monthsExpected[m] || 0) + Number(i.expectedAmount ?? 0);
      if (i.isSplitAllocation) row.monthsSplit[m] = true;
      row.total += amount;

      const cellStatus = i.status === 'completed' ? 'completed'
        : i.status === 'partial' ? 'partial'
        : (i.dueDate && i.dueDate < today) ? 'overdue'
        : 'pending';
      if ((priority[cellStatus] || 0) > (priority[row.monthStatus[m]] || 0)) {
        row.monthStatus[m] = cellStatus;
      }

      if (row.startMonth == null || m < row.startMonth) row.startMonth = m;
      if (row.endMonth == null || m > row.endMonth) row.endMonth = m;

      const pmKey = `${i.propertyId}_${m}`;
      if (!pmTenant.has(pmKey)) pmTenant.set(pmKey, { tenantId: i.tenantId, tenant: i.tenant });
    }

    // 水電費：歸屬到該物業該月有收款的租客；查無則歸入「未對應租客」列
    for (const u of utilityIncomes) {
      const amount = u.status === 'completed' ? Number(u.actualAmount ?? 0) : 0;
      if (amount === 0) continue;
      const pmKey = `${u.propertyId}_${u.incomeMonth}`;
      const match = pmTenant.get(pmKey);
      const tenantId = match ? match.tenantId : 0;
      const tenant = match ? match.tenant : null;
      const row = ensureRow(u.propertyId, tenantId, tenant);
      row.months[u.incomeMonth] = (row.months[u.incomeMonth] || 0) + amount;
      row.total += amount;
      if (row.startMonth == null || u.incomeMonth < row.startMonth) row.startMonth = u.incomeMonth;
      if (row.endMonth == null || u.incomeMonth > row.endMonth) row.endMonth = u.incomeMonth;
    }

    // 標記該物業×租客目前是否仍有生效/待審核合約
    const activeKeySet = new Set();
    if (propertyIds.size > 0) {
      const activeContracts = await prisma.rentalContract.findMany({
        where: {
          propertyId: { in: Array.from(propertyIds) },
          status: { in: ['active', 'pending'] },
        },
        select: { propertyId: true, tenantId: true },
      });
      for (const c of activeContracts) activeKeySet.add(`${c.propertyId}__${c.tenantId}`);
    }

    const rows = Array.from(byKey.values())
      .map((r) => ({ ...r, isCurrent: activeKeySet.has(r.key) }))
      .filter((r) => r.total > 0 || r.startMonth != null)
      .sort((a, b) => {
        const sa = a.sortOrder ?? 999999;
        const sb = b.sortOrder ?? 999999;
        if (sa !== sb) return sa - sb;
        if (a.propertyId !== b.propertyId) return a.propertyId - b.propertyId;
        const ma = a.startMonth ?? 99;
        const mb = b.startMonth ?? 99;
        if (ma !== mb) return ma - mb;
        return (a.tenantName || '').localeCompare(b.tenantName || '');
      });

    return NextResponse.json({ year: displayYear, rows });
  } catch (error) {
    console.error('GET /api/rentals/reports/income-by-tenant error:', error.message || error);
    return handleApiError(error);
  }
}

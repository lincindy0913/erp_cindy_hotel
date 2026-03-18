import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET ?year=2025&propertyId=&startDate=&endDate=
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

    // Determine year(s) to query
    let yearFilter;
    let startMonth = 1;
    let endMonth = 12;
    let displayYear;

    if (startDate && endDate) {
      if (startDate > endDate) {
        return NextResponse.json({ error: '結束日期不可早於開始日期' }, { status: 400 });
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
        return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
      }
      yearFilter = { equals: y };
      displayYear = y;
    }

    const incomeWhere = {
      ...(yearFilter.equals != null ? { incomeYear: yearFilter.equals } : { incomeYear: { gte: yearFilter.gte, lte: yearFilter.lte } }),
      ...(propertyIdFilter ? { propertyId: propertyIdFilter } : {})
    };
    const utilityWhere = { ...incomeWhere };

    const [incomes, utilityIncomes] = await Promise.all([
      prisma.rentalIncome.findMany({
        where: incomeWhere,
        select: {
          propertyId: true,
          incomeMonth: true,
          actualAmount: true,
          status: true,
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
            select: { id: true, name: true, buildingName: true, unitNo: true, address: true }
          })
        : [];

    const propLabel = (p) => p ? (p.name || [p.buildingName, p.unitNo].filter(Boolean).join(' ') || p.address || `物業#${p.id}`) : '';
    const byProperty = new Map();
    for (const p of propertyList) {
      byProperty.set(p.id, {
        propertyId: p.id,
        propertyLabel: propLabel(p),
        tenantName: null,
        months: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
        total: 0
      });
    }
    for (const i of incomes) {
      const row = byProperty.get(i.propertyId);
      if (!row) continue;
      const paid = i.status === 'completed' || i.status === 'partial';
      const amount = paid ? Number(i.actualAmount ?? 0) : 0;
      row.months[i.incomeMonth] = (row.months[i.incomeMonth] || 0) + amount;
      row.total += amount;
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

    const rows = Array.from(byProperty.values())
      .map(r => ({ ...r, months: r.months }))
      .filter(r => r.total > 0 || r.tenantName)
      .sort((a, b) => (a.propertyLabel || '').localeCompare(b.propertyLabel || ''));

    return NextResponse.json({ year: displayYear, rows });
  } catch (error) {
    console.error('GET /api/rentals/reports/income-by-month error:', error);
    return handleApiError(error);
  }
}

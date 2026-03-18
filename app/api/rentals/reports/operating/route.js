import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET ?year=2025&propertyId=&category=&startDate=&endDate=
 * Per property: 收租金額, 維修金額, 房務稅/地價稅, 淨利, 淨利率.
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

    let displayYear;
    let incomeYearFilter;
    let dateRangeFilter;
    let taxYearFilter;

    if (startDate && endDate) {
      if (startDate > endDate) {
        return NextResponse.json({ error: '結束日期不可早於開始日期' }, { status: 400 });
      }
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const sYear = sDate.getFullYear();
      const eYear = eDate.getFullYear();
      displayYear = sYear === eYear ? sYear : `${sYear}-${eYear}`;
      incomeYearFilter = sYear === eYear ? { incomeYear: sYear } : { incomeYear: { gte: sYear, lte: eYear } };
      dateRangeFilter = { maintenanceDate: { gte: startDate, lte: endDate } };
      taxYearFilter = sYear === eYear ? { taxYear: sYear } : { taxYear: { gte: sYear, lte: eYear } };
    } else {
      const y = year ? parseInt(year, 10) : new Date().getFullYear();
      if (Number.isNaN(y)) {
        return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
      }
      displayYear = y;
      incomeYearFilter = { incomeYear: y };
      dateRangeFilter = { maintenanceDate: { gte: `${y}-01-01`, lte: `${y}-12-31` } };
      taxYearFilter = { taxYear: y };
    }

    let propertyIdsInCategory = null;
    if (categoryParam) {
      if (categoryParam === '__RENTAL_CAT_EMPTY__') {
        const rows = await prisma.rentalProperty.findMany({
          where: { OR: [{ unitNo: null }, { unitNo: '' }] },
          select: { id: true }
        });
        propertyIdsInCategory = rows.map((r) => r.id);
      } else {
        const rows = await prisma.rentalProperty.findMany({
          where: { unitNo: categoryParam.trim() },
          select: { id: true }
        });
        propertyIdsInCategory = rows.map((r) => r.id);
      }
      if (propertyIdsInCategory.length === 0) {
        return NextResponse.json({ year: displayYear, rows: [] });
      }
    }

    const propFilter =
      propertyIdsInCategory && propertyIdsInCategory.length
        ? { propertyId: { in: propertyIdsInCategory } }
        : propertyIdFilter
          ? { propertyId: propertyIdFilter }
          : {};

    const propertiesWhere =
      propertyIdsInCategory && propertyIdsInCategory.length
        ? { id: { in: propertyIdsInCategory } }
        : propertyIdFilter
          ? { id: propertyIdFilter }
          : {};

    const [incomes, utilityIncomes, maintenances, taxes, properties] = await Promise.all([
      prisma.rentalIncome.findMany({
        where: { ...incomeYearFilter, ...propFilter },
        select: { propertyId: true, actualAmount: true, status: true }
      }),
      prisma.rentalUtilityIncome.findMany({
        where: { ...incomeYearFilter, ...propFilter },
        select: { propertyId: true, actualAmount: true, status: true }
      }),
      prisma.rentalMaintenance.findMany({
        where: { ...dateRangeFilter, ...propFilter },
        select: { propertyId: true, amount: true }
      }),
      prisma.propertyTax.findMany({
        where: { ...taxYearFilter, ...propFilter },
        select: { propertyId: true, amount: true }
      }),
      prisma.rentalProperty.findMany({
        where: propertiesWhere,
        select: { id: true, name: true, buildingName: true, unitNo: true, address: true }
      })
    ]);

    const propertyIds = new Set([
      ...incomes.map(i => i.propertyId),
      ...utilityIncomes.map(u => u.propertyId),
      ...maintenances.map(m => m.propertyId),
      ...taxes.map(t => t.propertyId)
    ]);
    const scopedById = propertyIdFilter || (propertyIdsInCategory && propertyIdsInCategory.length);
    const allProperties = scopedById
      ? properties
      : await prisma.rentalProperty.findMany({
          where: { id: { in: Array.from(propertyIds) } },
          select: { id: true, name: true, buildingName: true, unitNo: true, address: true }
        });

    const propMap = new Map(allProperties.map(p => [p.id, p]));

    const rentByProp = new Map();
    for (const i of incomes) {
      const amt = (i.status === 'completed' || i.status === 'partial') ? Number(i.actualAmount ?? 0) : 0;
      rentByProp.set(i.propertyId, (rentByProp.get(i.propertyId) || 0) + amt);
    }
    for (const u of utilityIncomes) {
      const amt = (u.status === 'completed') ? Number(u.actualAmount ?? 0) : 0;
      rentByProp.set(u.propertyId, (rentByProp.get(u.propertyId) || 0) + amt);
    }
    const maintByProp = new Map();
    for (const m of maintenances) {
      maintByProp.set(m.propertyId, (maintByProp.get(m.propertyId) || 0) + Number(m.amount));
    }
    const taxByProp = new Map();
    for (const t of taxes) {
      taxByProp.set(t.propertyId, (taxByProp.get(t.propertyId) || 0) + Number(t.amount));
    }

    const rows = Array.from(propertyIds).map(pid => {
      const prop = propMap.get(pid);
      const label = prop ? (prop.name || [prop.buildingName, prop.unitNo].filter(Boolean).join(' ') || prop.address || `物業#${pid}`) : `物業#${pid}`;
      const rent = rentByProp.get(pid) || 0;
      const maintenance = maintByProp.get(pid) || 0;
      const tax = taxByProp.get(pid) || 0;
      const totalExpense = maintenance + tax;
      const netProfit = rent - totalExpense;
      const profitMargin = rent > 0 ? (netProfit / rent) * 100 : null;
      return {
        propertyId: pid,
        propertyLabel: label,
        rentIncome: rent,
        maintenanceAmount: maintenance,
        taxAmount: tax,
        totalExpense,
        netProfit,
        profitMarginPercent: profitMargin != null ? Math.round(profitMargin * 100) / 100 : null
      };
    });

    rows.sort((a, b) => (a.propertyLabel || '').localeCompare(b.propertyLabel || ''));

    return NextResponse.json({ year: displayYear, rows });
  } catch (error) {
    console.error('GET /api/rentals/reports/operating error:', error);
    return handleApiError(error);
  }
}

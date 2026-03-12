import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET ?year=2025&propertyId= (optional)
 * Per property: 收租金額, 維修金額, 稅金, 淨利, 淨利率(淨利/收租).
 * 投報率: 若無物業成本欄位則不計算，僅顯示淨利與淨利率。
 */
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const propertyIdParam = searchParams.get('propertyId');
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    if (Number.isNaN(y)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }
    const propertyIdFilter = propertyIdParam ? parseInt(propertyIdParam, 10) : null;
    if (propertyIdParam != null && Number.isNaN(propertyIdFilter)) {
      return NextResponse.json({ error: 'Invalid propertyId' }, { status: 400 });
    }

    const [incomes, utilityIncomes, maintenances, taxes, properties] = await Promise.all([
      prisma.rentalIncome.findMany({
        where: { incomeYear: y, ...(propertyIdFilter != null ? { propertyId: propertyIdFilter } : {}) },
        select: { propertyId: true, actualAmount: true, status: true }
      }),
      prisma.rentalUtilityIncome.findMany({
        where: { incomeYear: y, ...(propertyIdFilter != null ? { propertyId: propertyIdFilter } : {}) },
        select: { propertyId: true, actualAmount: true, status: true }
      }),
      prisma.rentalMaintenance.findMany({
        where: {
          maintenanceDate: { gte: `${y}-01-01`, lte: `${y}-12-31` },
          ...(propertyIdFilter != null ? { propertyId: propertyIdFilter } : {})
        },
        select: { propertyId: true, amount: true }
      }),
      prisma.propertyTax.findMany({
        where: { taxYear: y, ...(propertyIdFilter != null ? { propertyId: propertyIdFilter } : {}) },
        select: { propertyId: true, amount: true }
      }),
      prisma.rentalProperty.findMany({
        where: propertyIdFilter != null ? { id: propertyIdFilter } : {},
        select: { id: true, name: true, buildingName: true, unitNo: true, address: true }
      })
    ]);

    const propertyIds = new Set([
      ...incomes.map(i => i.propertyId),
      ...utilityIncomes.map(u => u.propertyId),
      ...maintenances.map(m => m.propertyId),
      ...taxes.map(t => t.propertyId)
    ]);
    const allProperties = propertyIdFilter != null
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

    return NextResponse.json({ year: y, rows });
  } catch (error) {
    console.error('GET /api/rentals/reports/operating error:', error);
    return handleApiError(error);
  }
}

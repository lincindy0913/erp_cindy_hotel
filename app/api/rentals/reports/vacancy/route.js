import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET ?year=2025
// Returns per-property vacancy rate for the year
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear(), 10);
    if (Number.isNaN(year)) return NextResponse.json({ error: 'Invalid year' }, { status: 400 });

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const [properties, contracts] = await Promise.all([
      prisma.rentalProperty.findMany({
        select: { id: true, name: true, buildingName: true, unitNo: true, address: true, status: true }
      }),
      prisma.rentalContract.findMany({
        where: {
          status: { in: ['active', 'expired', 'terminated'] },
          startDate: { lte: yearEnd },
          endDate: { gte: yearStart }
        },
        select: { propertyId: true, startDate: true, endDate: true, monthlyRent: true, status: true,
          tenant: { select: { fullName: true, companyName: true, tenantType: true } } }
      })
    ]);

    const propLabel = (p) => p.name || [p.buildingName, p.unitNo].filter(Boolean).join(' ') || p.address || `物業#${p.id}`;

    const rows = properties.map(p => {
      const propContracts = contracts.filter(c => c.propertyId === p.id);
      const monthRented = [];

      for (let m = 1; m <= 12; m++) {
        const mFirst = `${year}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(year, m, 0).getDate();
        const mLast = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const isRented = propContracts.some(c => c.startDate <= mLast && c.endDate >= mFirst);
        monthRented.push(isRented);
      }

      const today = new Date().toISOString().split('T')[0];
      const displayYear = String(year);
      // Only count months that have already occurred (or current month) for vacancy rate
      const passedMonths = monthRented.filter((_, i) => {
        const mStr = `${year}-${String(i + 1).padStart(2, '0')}-01`;
        return mStr <= today;
      });
      const rentedCount = monthRented.filter(Boolean).length;
      const passedCount = passedMonths.length;
      const passedRentedCount = passedMonths.filter(Boolean).length;
      const vacancyRate = passedCount > 0 ? Math.round(((passedCount - passedRentedCount) / passedCount) * 100) : 0;

      const rents = propContracts.map(c => Number(c.monthlyRent)).filter(v => v > 0);
      const avgRent = rents.length > 0 ? Math.round(rents.reduce((s, v) => s + v, 0) / rents.length) : 0;

      return {
        propertyId: p.id,
        propertyLabel: propLabel(p),
        currentStatus: p.status,
        monthRented,  // boolean[12]
        rentedCount,
        vacancyRate,
        avgRent
      };
    }).sort((a, b) => b.vacancyRate - a.vacancyRate);

    const totalProps = rows.length;
    const avgVacancy = totalProps > 0 ? Math.round(rows.reduce((s, r) => s + r.vacancyRate, 0) / totalProps) : 0;
    const fullyRented = rows.filter(r => r.rentedCount === 12).length;

    return NextResponse.json({ year, rows, avgVacancy, fullyRented, totalProps });
  } catch (error) {
    console.error('GET /api/rentals/reports/vacancy error:', error.message || error);
    return handleApiError(error);
  }
}

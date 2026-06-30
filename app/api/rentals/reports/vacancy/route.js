import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

// GET ?year=2025
// Returns per-property vacancy rate for the year
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear(), 10);
    if (Number.isNaN(year)) return createErrorResponse('VALIDATION_FAILED', 'Invalid year', 400);

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const [properties, contracts] = await Promise.all([
      prisma.rentalProperty.findMany({
        select: { id: true, name: true, buildingName: true, unitNo: true, address: true, status: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
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

    const today = todayStr();

    const rows = properties.map(p => {
      const propContracts = contracts.filter(c => c.propertyId === p.id);
      const monthRented = [];   // 該月是否有合約涵蓋（含未來月份）
      const monthElapsed = [];  // 該月是否已開始（≤ 今天）

      for (let m = 1; m <= 12; m++) {
        const mFirst = `${year}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(year, m, 0).getDate();
        const mLast = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const isRented = propContracts.some(c => c.startDate <= mLast && c.endDate >= mFirst);
        monthRented.push(isRented);
        monthElapsed.push(mFirst <= today);
      }

      // 出租月數與空置率一律以「已過月份」為基準，避免未來合約月份把數字灌水
      // （否則會出現「年中卻顯示出租 12 個月、卻又空置 33%」這種矛盾）
      const passedCount = monthElapsed.filter(Boolean).length;
      const rentedCount = monthRented.filter((r, i) => r && monthElapsed[i]).length;
      const vacancyRate = passedCount > 0
        ? Math.round(((passedCount - rentedCount) / passedCount) * 100)
        : 0;

      const rents = propContracts.map(c => Number(c.monthlyRent)).filter(v => v > 0);
      const avgRent = rents.length > 0 ? Math.round(rents.reduce((s, v) => s + v, 0) / rents.length) : 0;

      return {
        propertyId: p.id,
        propertyLabel: propLabel(p),
        currentStatus: p.status,
        sortOrder: p.sortOrder ?? null,
        monthRented,   // boolean[12]：合約涵蓋
        monthElapsed,  // boolean[12]：是否已過（未過月份前端淺色顯示、不計入）
        rentedCount,   // 已過月份中的出租月數
        passedCount,   // 該年度已過月數
        vacancyRate,
        avgRent
      };
    }); // 順序已由 orderBy sortOrder 決定

    const totalProps = rows.length;
    const avgVacancy = totalProps > 0 ? Math.round(rows.reduce((s, r) => s + r.vacancyRate, 0) / totalProps) : 0;
    // 滿租 = 已過月份全數出租（0% 空置）
    const fullyRented = rows.filter(r => r.passedCount > 0 && r.vacancyRate === 0).length;
    const passedMonths = rows.length > 0 ? rows[0].passedCount : 0;

    return NextResponse.json({ year, rows, avgVacancy, fullyRented, totalProps, passedMonths });
  } catch (error) {
    console.error('GET /api/rentals/reports/vacancy error:', error.message || error);
    return handleApiError(error);
  }
}

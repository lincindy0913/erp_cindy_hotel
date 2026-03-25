import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year')) || new Date().getFullYear();

    // Get all properties with their contracts and incomes
    const properties = await prisma.rentalProperty.findMany({
      include: {
        contracts: {
          where: { status: { in: ['active', 'pending'] } },
          select: {
            id: true,
            monthlyRent: true,
            startDate: true,
            endDate: true,
            status: true
          }
        },
        rentalIncomes: {
          where: {
            incomeYear: year
          },
          select: {
            incomeMonth: true,
            expectedAmount: true,
            actualAmount: true,
            status: true
          }
        }
      }
    });

    const propertyResults = [];
    let totalIncome = 0;
    let totalExpected = 0;

    for (const prop of properties) {
      // Get monthly rent from active contract
      const activeContract = prop.contracts.find(c => c.status === 'active') || prop.contracts[0];
      const monthlyRent = activeContract ? Number(activeContract.monthlyRent) : 0;
      const annualExpectedRent = monthlyRent * 12;

      // Calculate actual income for the year
      const yearIncome = prop.rentalIncomes.reduce((sum, ri) => {
        return sum + Number(ri.actualAmount || 0);
      }, 0);

      const yearExpected = prop.rentalIncomes.reduce((sum, ri) => {
        return sum + Number(ri.expectedAmount || 0);
      }, 0);

      // Collection rate
      const collectionRate = yearExpected > 0
        ? Math.round((yearIncome / yearExpected) * 10000) / 100
        : 0;

      // ROI = actualIncome / expectedAnnualRent * 100
      const roi = annualExpectedRent > 0
        ? Math.round((yearIncome / annualExpectedRent) * 10000) / 100
        : 0;

      // Months with income
      const paidMonths = prop.rentalIncomes.filter(ri => ri.status === 'paid' || ri.status === 'confirmed').length;
      const totalMonths = prop.rentalIncomes.length;

      totalIncome += yearIncome;
      totalExpected += yearExpected;

      propertyResults.push({
        id: prop.id,
        name: prop.name,
        address: prop.address,
        buildingName: prop.buildingName,
        unitNo: prop.unitNo,
        status: prop.status,
        monthlyRent: Math.round(monthlyRent),
        totalIncome: Math.round(yearIncome),
        expectedIncome: Math.round(yearExpected),
        roi,
        collectionRate,
        paidMonths,
        totalMonths
      });
    }

    // Summary
    const propertiesWithRent = propertyResults.filter(p => p.monthlyRent > 0);
    const avgRoi = propertiesWithRent.length > 0
      ? Math.round(propertiesWithRent.reduce((sum, p) => sum + p.roi, 0) / propertiesWithRent.length * 100) / 100
      : 0;

    const overallCollectionRate = totalExpected > 0
      ? Math.round((totalIncome / totalExpected) * 10000) / 100
      : 0;

    return NextResponse.json({
      properties: propertyResults,
      summary: {
        totalProperties: properties.length,
        totalIncome: Math.round(totalIncome),
        totalExpected: Math.round(totalExpected),
        avgRoi,
        overallCollectionRate
      },
      year
    });
  } catch (error) {
    return handleApiError(error);
  }
}

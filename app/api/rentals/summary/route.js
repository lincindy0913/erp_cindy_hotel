import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth() + 1;
    const today = now.toISOString().split('T')[0];

    // Total properties by status
    const totalProperties = await prisma.rentalProperty.count();
    const rentedCount = await prisma.rentalProperty.count({ where: { status: 'rented' } });
    const availableCount = await prisma.rentalProperty.count({ where: { status: 'available' } });
    const maintenanceCount = await prisma.rentalProperty.count({ where: { status: 'maintenance' } });

    // This month expected and collected
    const thisMonthIncomes = await prisma.rentalIncome.findMany({
      where: { incomeYear: thisYear, incomeMonth: thisMonth }
    });

    const thisMonthExpected = thisMonthIncomes.reduce((s, i) => s + Number(i.expectedAmount), 0);
    const thisMonthCollected = thisMonthIncomes
      .filter(i => i.status === 'completed' || i.status === 'partial')
      .reduce((s, i) => s + Number(i.actualAmount || 0), 0);

    // Overdue items (pending + past due date)
    const overdueIncomes = await prisma.rentalIncome.findMany({
      where: {
        status: 'pending',
        dueDate: { lt: today }
      }
    });
    const overdueCount = overdueIncomes.length;
    const overdueAmount = overdueIncomes.reduce((s, i) => s + Number(i.expectedAmount), 0);

    // Expiring contracts (within 60 days)
    const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const expiringContracts = await prisma.rentalContract.count({
      where: {
        status: 'active',
        endDate: { lte: futureDateStr, gte: today }
      }
    });

    // Pending taxes
    const pendingTaxes = await prisma.propertyTax.count({
      where: { status: 'pending' }
    });

    // Pending maintenance
    const pendingMaintenance = await prisma.rentalMaintenance.count({
      where: { status: 'pending' }
    });

    return NextResponse.json({
      totalProperties,
      rentedCount,
      availableCount,
      maintenanceCount,
      thisMonthExpected,
      thisMonthCollected,
      overdueCount,
      overdueAmount,
      expiringContracts,
      pendingTaxes,
      pendingMaintenance
    });
  } catch (error) {
    console.error('GET /api/rentals/summary error:', error.message || error);
    return handleApiError(error);
  }
}

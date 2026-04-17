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

    // This month pending count
    const thisMonthPending = thisMonthIncomes.filter(i => i.status === 'pending').length;
    const collectionRate = thisMonthExpected > 0
      ? Math.round((thisMonthCollected / thisMonthExpected) * 100)
      : 0;

    // Overdue detail list (top 8)
    const overdueDetails = await prisma.rentalIncome.findMany({
      where: { status: 'pending', dueDate: { lt: today } },
      include: {
        property: { select: { name: true } },
        tenant: { select: { fullName: true, companyName: true, tenantType: true } }
      },
      orderBy: { dueDate: 'asc' },
      take: 8
    });

    // Expiring contract detail list (top 8, within 30 days first)
    const expiringContractDetails = await prisma.rentalContract.findMany({
      where: { status: 'active', endDate: { lte: futureDateStr, gte: today } },
      include: {
        property: { select: { name: true } },
        tenant: { select: { fullName: true, companyName: true, tenantType: true } }
      },
      orderBy: { endDate: 'asc' },
      take: 8
    });

    return NextResponse.json({
      totalProperties,
      rentedCount,
      availableCount,
      maintenanceCount,
      thisMonthExpected,
      thisMonthCollected,
      thisMonthPending,
      collectionRate,
      overdueCount,
      overdueAmount,
      expiringContracts,
      pendingTaxes,
      pendingMaintenance,
      overdueDetails: overdueDetails.map(i => ({
        id: i.id,
        propertyName: i.property.name,
        tenantName: i.tenant.tenantType === 'company' ? i.tenant.companyName : i.tenant.fullName,
        expectedAmount: Number(i.expectedAmount),
        dueDate: i.dueDate,
        incomeYear: i.incomeYear,
        incomeMonth: i.incomeMonth,
        daysOverdue: Math.floor((new Date(today) - new Date(i.dueDate)) / 86400000)
      })),
      expiringContractDetails: expiringContractDetails.map(c => ({
        id: c.id,
        propertyName: c.property.name,
        tenantName: c.tenant.tenantType === 'company' ? c.tenant.companyName : c.tenant.fullName,
        endDate: c.endDate,
        monthlyRent: Number(c.monthlyRent),
        daysUntilExpiry: Math.floor((new Date(c.endDate) - new Date(today)) / 86400000)
      }))
    });
  } catch (error) {
    console.error('GET /api/rentals/summary error:', error.message || error);
    return handleApiError(error);
  }
}

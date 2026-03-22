import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const status = searchParams.get('status');
    const propertyId = searchParams.get('propertyId');

    const where = {};
    if (year) where.incomeYear = parseInt(year);
    if (month) where.incomeMonth = parseInt(month);
    if (status) where.status = status;
    if (propertyId) where.propertyId = parseInt(propertyId);

    const incomes = await prisma.rentalIncome.findMany({
      where,
      include: {
        property: { select: { id: true, name: true, buildingName: true } },
        tenant: { select: { id: true, fullName: true, companyName: true, tenantType: true } },
        contract: { select: { id: true, contractNo: true, monthlyRent: true } },
        payments: { orderBy: { sequenceNo: 'asc' } }
      },
      orderBy: [{ incomeYear: 'desc' }, { incomeMonth: 'desc' }, { dueDate: 'asc' }]
    });

    const result = incomes.map(i => ({
      ...i,
      propertyName: i.property.name,
      buildingName: i.property.buildingName,
      tenantName: i.tenant.tenantType === 'company' ? i.tenant.companyName : i.tenant.fullName
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/rentals/income error:', error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const body = await request.json();
    const { year, month } = body;

    if (!year || !month) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '年份和月份為必填', 400);
    }

    const y = parseInt(year);
    const m = parseInt(month);

    // Find all active contracts
    const activeContracts = await prisma.rentalContract.findMany({
      where: {
        status: 'active',
        startDate: { lte: `${y}-${String(m).padStart(2, '0')}-31` },
        endDate: { gte: `${y}-${String(m).padStart(2, '0')}-01` }
      }
    });

    const result = await prisma.$transaction(async (tx) => {
      let created = 0;
      let skipped = 0;

      for (const contract of activeContracts) {
        // Check if already exists
        const existing = await tx.rentalIncome.findUnique({
          where: {
            contractId_incomeYear_incomeMonth: {
              contractId: contract.id,
              incomeYear: y,
              incomeMonth: m
            }
          }
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Calculate due date
        const dueDay = Math.min(contract.paymentDueDay, 28);
        const dueDate = `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

        await tx.rentalIncome.create({
          data: {
            contractId: contract.id,
            propertyId: contract.propertyId,
            tenantId: contract.tenantId,
            incomeYear: y,
            incomeMonth: m,
            dueDate,
            expectedAmount: contract.monthlyRent,
            status: 'pending'
          }
        });

        created++;
      }

      return { created, skipped };
    });

    const { created, skipped } = result;

    return NextResponse.json({
      success: true,
      created,
      skipped,
      total: activeContracts.length
    });
  } catch (error) {
    console.error('POST /api/rentals/income error:', error);
    return handleApiError(error);
  }
}

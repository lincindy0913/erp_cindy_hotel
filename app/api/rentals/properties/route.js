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
    const buildingName = searchParams.get('buildingName');
    const status = searchParams.get('status');

    const where = {};
    if (buildingName) where.buildingName = buildingName;
    if (status) where.status = status;

    const properties = await prisma.rentalProperty.findMany({
      where,
      include: {
        contracts: {
          where: { status: 'active' },
          include: {
            tenant: {
              select: { fullName: true, companyName: true, tenantType: true }
            }
          },
          take: 1
        },
        rentCollectAccount: { select: { id: true, name: true } },
        depositAccount: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true, assetType: true, hasHouseTax: true, hasLandTax: true, hasMaintenanceFee: true, isAvailableForRental: true } },
      },
      orderBy: [{ buildingName: 'asc' }, { name: 'asc' }]
    });

    const result = properties.map(p => {
      const activeContract = p.contracts[0] || null;
      const tenantName = activeContract
        ? (activeContract.tenant.tenantType === 'company'
          ? activeContract.tenant.companyName
          : activeContract.tenant.fullName)
        : null;
      return {
        ...p,
        currentTenantName: tenantName,
        currentContractId: activeContract?.id || null
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/rentals/properties error:', error.message || error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const body = await request.json();

    if (!body.name) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '物業名稱為必填', 400);
    }

    const property = await prisma.rentalProperty.create({
      data: {
        name: body.name,
        address: body.address || null,
        buildingName: body.buildingName || null,
        unitNo: body.unitNo || null,
        ownerName: body.ownerName || null,
        houseTaxRegistrationNo: body.houseTaxRegistrationNo || null,
        rentCollectAccountId: body.rentCollectAccountId ? parseInt(body.rentCollectAccountId) : null,
        depositAccountId: body.depositAccountId ? parseInt(body.depositAccountId) : null,
        status: body.status || 'available',
        note: body.note || null,
        publicInterestLandlord: body.publicInterestLandlord === true,
        publicInterestApplicant: body.publicInterestApplicant || null,
        publicInterestNote: body.publicInterestNote || null,
        publicInterestStartDate: body.publicInterestStartDate || null,
        publicInterestEndDate: body.publicInterestEndDate || null,
        publicInterestRent: body.publicInterestRent ? parseFloat(body.publicInterestRent) : null,
        collectUtilityFee: body.collectUtilityFee === true,
      }
    });

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    console.error('POST /api/rentals/properties error:', error.message || error);
    return handleApiError(error);
  }
}

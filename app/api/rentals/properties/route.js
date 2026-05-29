import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

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
          where: { status: { in: ['active', 'expired', 'pending'] } },
          select: {
            id: true,
            contractNo: true,
            monthlyRent: true,
            startDate: true,
            endDate: true,
            status: true,
            depositAmount: true,
            depositReceived: true,
            depositRefunded: true,
            previousContractId: true,
            tenant: { select: { id: true, fullName: true, companyName: true, tenantType: true, phone: true } }
          },
          orderBy: [{ status: 'asc' }, { endDate: 'desc' }],
          take: 3
        },
        rentCollectAccount: { select: { id: true, name: true } },
        depositAccount: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true, assetType: true, address: true, areaSqm: true, acquisitionDate: true, notes: true, rentalPropertyId: true, hasHouseTax: true, hasLandTax: true, hasMaintenanceFee: true, isAvailableForRental: true, serialNo: true, category: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { buildingName: 'asc' }, { name: 'asc' }]
    });

    const result = properties.map(p => {
      const activeContract = p.contracts.find(c => c.status === 'active') || p.contracts[0] || null;
      const tenantName = activeContract?.tenant
        ? (activeContract.tenant.tenantType === 'company'
          ? activeContract.tenant.companyName
          : activeContract.tenant.fullName)
        : null;
      return {
        ...p,
        currentTenantName: tenantName,
        currentTenantPhone: activeContract?.tenant?.phone || null,
        currentContractId: activeContract?.id || null,
        currentContractNo: activeContract?.contractNo || null,
        currentMonthlyRent: activeContract?.monthlyRent != null ? Number(activeContract.monthlyRent) : null,
        currentContractStart: activeContract?.startDate || null,
        currentContractEnd: activeContract?.endDate || null,
        currentContractStatus: activeContract?.status || null,
        currentDepositAmount: activeContract?.depositAmount != null ? Number(activeContract.depositAmount) : null,
        currentDepositReceived: activeContract?.depositReceived ?? null,
        currentDepositRefunded: activeContract?.depositRefunded ?? null,
        currentContractHasPrev: !!activeContract?.previousContractId,
        renewalCount: p.contracts.filter(c => c.previousContractId != null).length,
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

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_PROPERTY_CREATE,
      targetModule: 'rentals',
      targetRecordId: property.id,
      targetRecordNo: property.name,
      afterState: { name: property.name, status: property.status },
      note: `新增物業「${property.name}」`,
    });

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    console.error('POST /api/rentals/properties error:', error.message || error);
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const property = await prisma.rentalProperty.findUnique({
      where: { id: parseInt(id) },
      include: {
        contracts: {
          include: {
            tenant: { select: { fullName: true, companyName: true, tenantType: true } }
          },
          orderBy: { createdAt: 'desc' }
        },
        rentCollectAccount: { select: { id: true, name: true } },
        depositAccount: { select: { id: true, name: true } },
        propertyTaxes: { orderBy: { taxYear: 'desc' } },
        maintenances: { orderBy: { maintenanceDate: 'desc' } }
      }
    });

    if (!property) {
      return createErrorResponse('NOT_FOUND', '找不到物業', 404);
    }

    return NextResponse.json(property);
  } catch (error) {
    console.error('GET /api/rentals/properties/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const body = await request.json();

    const property = await prisma.rentalProperty.update({
      where: { id: parseInt(id) },
      data: {
        name: body.name,
        address: body.address,
        buildingName: body.buildingName,
        unitNo: body.unitNo,
        rentCollectAccountId: body.rentCollectAccountId ? parseInt(body.rentCollectAccountId) : null,
        depositAccountId: body.depositAccountId ? parseInt(body.depositAccountId) : null,
        status: body.status,
        note: body.note,
        publicInterestLandlord: body.publicInterestLandlord === true,
        publicInterestApplicant: body.publicInterestApplicant || null,
        publicInterestNote: body.publicInterestNote || null,
        publicInterestStartDate: body.publicInterestStartDate || null,
        publicInterestEndDate: body.publicInterestEndDate || null,
        publicInterestRent: body.publicInterestRent ? parseFloat(body.publicInterestRent) : null,
      }
    });

    return NextResponse.json(property);
  } catch (error) {
    console.error('PUT /api/rentals/properties/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const propertyId = parseInt(id);

    const contractCount = await prisma.rentalContract.count({
      where: { propertyId }
    });

    if (contractCount > 0) {
      return createErrorResponse('ACCOUNT_HAS_DEPENDENCIES', '此物業尚有合約，無法刪除', 400);
    }

    await prisma.rentalProperty.delete({ where: { id: propertyId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/properties/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

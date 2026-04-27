import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const ASSET_TYPES = new Set(['LAND', 'BUILDING', 'MIXED', 'OTHER']);

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.ASSET_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const assets = await prisma.asset.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        rentalProperty: {
          select: {
            id: true,
            name: true,
            address: true,
            buildingName: true,
            unitNo: true,
            status: true,
          },
        },
      },
    });
    return NextResponse.json(assets);
  } catch (error) {
    console.error('GET /api/assets error:', error.message || error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ASSET_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '資產名稱為必填', 400);
    }
    const assetType = (body.assetType || 'BUILDING').toUpperCase();
    if (!ASSET_TYPES.has(assetType)) {
      return createErrorResponse('INVALID_INPUT', '資產類型須為 LAND、BUILDING、MIXED 或 OTHER', 400);
    }

    let rentalPropertyId = null;
    if (body.rentalPropertyId != null && body.rentalPropertyId !== '') {
      rentalPropertyId = parseInt(String(body.rentalPropertyId), 10);
      if (Number.isNaN(rentalPropertyId)) {
        return createErrorResponse('INVALID_INPUT', 'rentalPropertyId 無效', 400);
      }
      const prop = await prisma.rentalProperty.findUnique({ where: { id: rentalPropertyId } });
      if (!prop) {
        return createErrorResponse('NOT_FOUND', '查無此物業', 404);
      }
      const taken = await prisma.asset.findUnique({ where: { rentalPropertyId } });
      if (taken) {
        return createErrorResponse('CONFLICT', '此物業已綁定其他資產主檔', 409);
      }
    }

    const areaSqm =
      body.areaSqm != null && body.areaSqm !== '' ? parseFloat(String(body.areaSqm)) : null;
    if (areaSqm != null && Number.isNaN(areaSqm)) {
      return createErrorResponse('INVALID_INPUT', '面積格式無效', 400);
    }

    const asset = await prisma.asset.create({
      data: {
        name: body.name.trim(),
        assetType,
        address: body.address?.trim() || null,
        areaSqm: areaSqm != null ? areaSqm : null,
        acquisitionDate: body.acquisitionDate?.trim() || null,
        notes: body.notes?.trim() || null,
        isAvailableForRental: body.isAvailableForRental === true,
        hasHouseTax: body.hasHouseTax === true,
        hasLandTax: body.hasLandTax === true,
        hasMaintenanceFee: body.hasMaintenanceFee === true,
        rentalPropertyId,
      },
      include: {
        rentalProperty: {
          select: { id: true, name: true, address: true, buildingName: true, unitNo: true, status: true },
        },
      },
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.ASSET_CREATE,
      targetModule: 'asset',
      targetRecordId: asset.id,
      targetRecordNo: asset.name,
      afterState: { name: asset.name, assetType: asset.assetType, address: asset.address, rentalPropertyId: asset.rentalPropertyId },
      note: `建立資產 ${asset.name}`,
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error('POST /api/assets error:', error.message || error);
    return handleApiError(error);
  }
}

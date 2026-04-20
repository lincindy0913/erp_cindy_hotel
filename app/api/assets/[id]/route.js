import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const ASSET_TYPES = new Set(['LAND', 'BUILDING', 'MIXED', 'OTHER']);

export async function GET(_request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (Number.isNaN(id)) {
    return createErrorResponse('INVALID_INPUT', 'id 無效', 400);
  }

  try {
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        rentalProperty: {
          include: {
            contracts: {
              where: { status: 'active' },
              take: 3,
              include: { tenant: { select: { fullName: true, companyName: true, tenantType: true } } },
            },
          },
        },
      },
    });
    if (!asset) {
      return createErrorResponse('NOT_FOUND', '查無資產', 404);
    }
    return NextResponse.json(asset);
  } catch (error) {
    console.error('GET /api/assets/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (Number.isNaN(id)) {
    return createErrorResponse('INVALID_INPUT', 'id 無效', 400);
  }

  try {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '查無資產', 404);
    }

    const body = await request.json();
    const data = {};

    if (body.name != null) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '資產名稱不可為空', 400);
      }
      data.name = body.name.trim();
    }
    if (body.assetType != null) {
      const t = String(body.assetType).toUpperCase();
      if (!ASSET_TYPES.has(t)) {
        return createErrorResponse('INVALID_INPUT', '資產類型無效', 400);
      }
      data.assetType = t;
    }
    if (body.address !== undefined) {
      data.address = body.address == null || body.address === '' ? null : String(body.address).trim();
    }
    if (body.areaSqm !== undefined) {
      if (body.areaSqm == null || body.areaSqm === '') {
        data.areaSqm = null;
      } else {
        const n = parseFloat(String(body.areaSqm));
        if (Number.isNaN(n)) {
          return createErrorResponse('INVALID_INPUT', '面積格式無效', 400);
        }
        data.areaSqm = n;
      }
    }
    if (body.notes !== undefined) {
      data.notes = body.notes == null || body.notes === '' ? null : String(body.notes).trim();
    }
    if (body.acquisitionDate !== undefined) {
      data.acquisitionDate = body.acquisitionDate == null || body.acquisitionDate === '' ? null : String(body.acquisitionDate).trim();
    }

    if (body.rentalPropertyId !== undefined) {
      if (body.rentalPropertyId == null || body.rentalPropertyId === '') {
        data.rentalPropertyId = null;
      } else {
        const pid = parseInt(String(body.rentalPropertyId), 10);
        if (Number.isNaN(pid)) {
          return createErrorResponse('INVALID_INPUT', 'rentalPropertyId 無效', 400);
        }
        const prop = await prisma.rentalProperty.findUnique({ where: { id: pid } });
        if (!prop) {
          return createErrorResponse('NOT_FOUND', '查無此物業', 404);
        }
        const taken = await prisma.asset.findFirst({
          where: { rentalPropertyId: pid, NOT: { id } },
        });
        if (taken) {
          return createErrorResponse('CONFLICT', '此物業已綁定其他資產主檔', 409);
        }
        data.rentalPropertyId = pid;
      }
    }

    const asset = await prisma.asset.update({
      where: { id },
      data,
      include: {
        rentalProperty: {
          select: { id: true, name: true, address: true, buildingName: true, unitNo: true, status: true },
        },
      },
    });
    return NextResponse.json(asset);
  } catch (error) {
    console.error('PATCH /api/assets/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

export async function DELETE(_request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (Number.isNaN(id)) {
    return createErrorResponse('INVALID_INPUT', 'id 無效', 400);
  }

  try {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '查無資產', 404);
    }
    await prisma.asset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/assets/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

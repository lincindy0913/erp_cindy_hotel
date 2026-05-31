import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ASSET_VIEW);
  if (!auth.ok) return auth.response;

  const { id: idParam } = await params;
  const assetId = parseInt(idParam, 10);
  if (Number.isNaN(assetId)) return createErrorResponse('INVALID_INPUT', 'id 無效', 400);

  try {
    const disposals = await prisma.assetDisposal.findMany({
      where: { assetId },
      orderBy: { disposalDate: 'desc' },
    });
    return NextResponse.json(disposals);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ASSET_EDIT);
  if (!auth.ok) return auth.response;

  const { id: idParam } = await params;
  const assetId = parseInt(idParam, 10);
  if (Number.isNaN(assetId)) return createErrorResponse('INVALID_INPUT', 'id 無效', 400);

  try {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) return createErrorResponse('NOT_FOUND', '查無資產', 404);

    const body = await request.json();
    if (!body.disposalDate) return createErrorResponse('REQUIRED_FIELD_MISSING', '處分日期必填', 400);

    const data = {
      assetId,
      disposalDate: String(body.disposalDate),
      salePrice:             body.salePrice             != null && body.salePrice             !== '' ? parseFloat(body.salePrice)             : null,
      stampTax:              body.stampTax              != null && body.stampTax              !== '' ? parseFloat(body.stampTax)              : null,
      landValueIncrementTax: body.landValueIncrementTax != null && body.landValueIncrementTax !== '' ? parseFloat(body.landValueIncrementTax) : null,
      notes: body.notes?.trim() || null,
    };

    const disposal = await prisma.assetDisposal.create({ data });

    // 處分後資產標記為不供出租
    await prisma.asset.update({
      where: { id: assetId },
      data: { isAvailableForRental: false },
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.ASSET_DISPOSAL_CREATE,
      targetModule: 'asset_disposal',
      targetRecordId: disposal.id,
      targetRecordNo: asset.name,
      afterState: data,
      note: `建立資產處分記錄：${asset.name}（${data.disposalDate}）`,
    });

    return NextResponse.json(disposal, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

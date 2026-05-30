import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ASSET_EDIT);
  if (!auth.ok) return auth.response;

  const { id: idParam, disposalId: didParam } = await params;
  const assetId = parseInt(idParam, 10);
  const disposalId = parseInt(didParam, 10);
  if (Number.isNaN(assetId) || Number.isNaN(disposalId)) return createErrorResponse('INVALID_INPUT', 'id 無效', 400);

  try {
    const existing = await prisma.assetDisposal.findFirst({ where: { id: disposalId, assetId } });
    if (!existing) return createErrorResponse('NOT_FOUND', '查無處分記錄', 404);

    const body = await request.json();
    const data = {};
    if (body.disposalDate != null)          data.disposalDate          = String(body.disposalDate);
    if (body.salePrice             !== undefined) data.salePrice             = body.salePrice             != null && body.salePrice             !== '' ? parseFloat(body.salePrice)             : null;
    if (body.stampTax              !== undefined) data.stampTax              = body.stampTax              != null && body.stampTax              !== '' ? parseFloat(body.stampTax)              : null;
    if (body.landValueIncrementTax !== undefined) data.landValueIncrementTax = body.landValueIncrementTax != null && body.landValueIncrementTax !== '' ? parseFloat(body.landValueIncrementTax) : null;
    if (body.notes                 !== undefined) data.notes                 = body.notes?.trim() || null;

    const disposal = await prisma.assetDisposal.update({ where: { id: disposalId }, data });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.ASSET_DISPOSAL_UPDATE,
      targetModule: 'asset_disposal',
      targetRecordId: disposalId,
      beforeState: { disposalDate: existing.disposalDate, salePrice: existing.salePrice },
      afterState: data,
      note: `修改資產處分記錄 id=${disposalId}`,
    });

    return NextResponse.json(disposal);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ASSET_EDIT);
  if (!auth.ok) return auth.response;

  const { id: idParam, disposalId: didParam } = await params;
  const assetId = parseInt(idParam, 10);
  const disposalId = parseInt(didParam, 10);
  if (Number.isNaN(assetId) || Number.isNaN(disposalId)) return createErrorResponse('INVALID_INPUT', 'id 無效', 400);

  try {
    const existing = await prisma.assetDisposal.findFirst({ where: { id: disposalId, assetId } });
    if (!existing) return createErrorResponse('NOT_FOUND', '查無處分記錄', 404);

    await prisma.assetDisposal.delete({ where: { id: disposalId } });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.ASSET_DISPOSAL_DELETE,
      targetModule: 'asset_disposal',
      targetRecordId: disposalId,
      beforeState: { disposalDate: existing.disposalDate, salePrice: existing.salePrice },
      note: `刪除資產處分記錄 id=${disposalId}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

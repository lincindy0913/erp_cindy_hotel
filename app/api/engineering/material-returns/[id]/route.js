import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';

export const dynamic = 'force-dynamic';

function serialize(r) {
  return { ...r, quantity: Number(r.quantity), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();
    const existing = await prisma.engineeringMaterialReturn.findUnique({ where: { id }, select: { projectId: true } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到退料記錄', 404);
    await assertEngineeringProjectOpen(existing.projectId);
    const row = await prisma.engineeringMaterialReturn.update({
      where: { id },
      data: {
        ...(data.returnDate   !== undefined && { returnDate:   data.returnDate }),
        ...(data.quantity     !== undefined && { quantity:     parseFloat(data.quantity) }),
        ...(data.unit         !== undefined && { unit:         data.unit?.trim() || null }),
        ...(data.description  !== undefined && { description:  data.description?.trim() || null }),
        ...(data.reason       !== undefined && { reason:       data.reason?.trim() || null }),
        ...(data.status       !== undefined && { status:       data.status }),
        ...(data.materialId   !== undefined && { materialId:   data.materialId ? parseInt(data.materialId) : null }),
        ...(data.note         !== undefined && { note:         data.note?.trim() || null }),
      },
    });
    return NextResponse.json(serialize(row));
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const existing = await prisma.engineeringMaterialReturn.findUnique({ where: { id }, select: { projectId: true } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到退料記錄', 404);
    await assertEngineeringProjectOpen(existing.projectId);
    await prisma.engineeringMaterialReturn.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e); }
}

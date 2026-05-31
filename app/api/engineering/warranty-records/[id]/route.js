import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';

export const dynamic = 'force-dynamic';

function serializeRecord(r) {
  return {
    ...r,
    cost: r.cost != null ? Number(r.cost) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();
    const existing = await prisma.engineeringWarrantyRecord.findUnique({ where: { id }, select: { projectId: true } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到維修紀錄', 404);
    await assertEngineeringProjectOpen(existing.projectId);
    const record = await prisma.engineeringWarrantyRecord.update({
      where: { id },
      data: {
        ...(data.reportDate !== undefined && { reportDate: data.reportDate }),
        ...(data.description !== undefined && { description: data.description.trim() }),
        ...(data.handler !== undefined && { handler: data.handler?.trim() || null }),
        ...(data.resolvedDate !== undefined && { resolvedDate: data.resolvedDate || null }),
        ...(data.cost !== undefined && { cost: data.cost ? parseFloat(data.cost) : null }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.note !== undefined && { note: data.note?.trim() || null }),
      },
      include: { project: { select: { id: true, code: true, name: true } } },
    });
    return NextResponse.json(serializeRecord(record));
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const existing = await prisma.engineeringWarrantyRecord.findUnique({ where: { id }, select: { projectId: true } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到維修紀錄', 404);
    await assertEngineeringProjectOpen(existing.projectId);
    await prisma.engineeringWarrantyRecord.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e); }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const existing = await prisma.engineeringMilestone.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到里程碑', 404);
    await assertEngineeringProjectOpen(existing.projectId);
    const data = await request.json();
    if (data.completionPct !== undefined) {
      const pct = parseInt(data.completionPct);
      if (pct < 0 || pct > 100) return createErrorResponse('VALIDATION_FAILED', '完成度須介於 0~100', 400);
    }
    const milestone = await prisma.engineeringMilestone.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.completionPct !== undefined && { completionPct: parseInt(data.completionPct) }),
        ...(data.plannedDate !== undefined && { plannedDate: data.plannedDate || null }),
        ...(data.actualDate !== undefined && { actualDate: data.actualDate || null }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.note !== undefined && { note: data.note?.trim() || null }),
        ...(data.sortOrder !== undefined && { sortOrder: parseInt(data.sortOrder) }),
      },
    });
    return NextResponse.json({ ...milestone, createdAt: milestone.createdAt.toISOString(), updatedAt: milestone.updatedAt.toISOString() });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const existing = await prisma.engineeringMilestone.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到里程碑', 404);
    await assertEngineeringProjectOpen(existing.projectId);
    await prisma.engineeringMilestone.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e); }
}

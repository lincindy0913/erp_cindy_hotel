import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const projectId = parseInt(rawId);
  if (Number.isNaN(projectId)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const milestones = await prisma.engineeringMilestone.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json(milestones.map(m => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })));
  } catch (e) { return handleApiError(e); }
}

export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const projectId = parseInt(rawId);
  if (Number.isNaN(projectId)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    await assertEngineeringProjectOpen(projectId);
    const data = await request.json();
    if (!data.name?.trim()) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫里程碑名稱', 400);
    const pct = parseInt(data.completionPct ?? 0);
    if (pct < 0 || pct > 100) return createErrorResponse('VALIDATION_FAILED', '完成度須介於 0~100', 400);
    const maxOrder = await prisma.engineeringMilestone.findFirst({
      where: { projectId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true },
    });
    const milestone = await prisma.engineeringMilestone.create({
      data: {
        projectId,
        name: data.name.trim(),
        completionPct: pct,
        plannedDate: data.plannedDate || null,
        actualDate: data.actualDate || null,
        status: data.status || 'pending',
        note: data.note?.trim() || null,
        sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json({ ...milestone, createdAt: milestone.createdAt.toISOString(), updatedAt: milestone.updatedAt.toISOString() }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

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

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const where = projectId ? { projectId: parseInt(projectId) } : {};
    const records = await prisma.engineeringWarrantyRecord.findMany({
      where,
      include: { project: { select: { id: true, code: true, name: true } } },
      orderBy: [{ reportDate: 'desc' }, { id: 'desc' }],
    });
    return NextResponse.json(records.map(serializeRecord));
  } catch (e) { return handleApiError(e); }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  try {
    const data = await request.json();
    if (!data.projectId) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇工程案', 400);
    if (!data.reportDate) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫報修日期', 400);
    if (!data.description?.trim()) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫問題描述', 400);
    const projectId = parseInt(data.projectId);
    await assertEngineeringProjectOpen(projectId);
    const record = await prisma.engineeringWarrantyRecord.create({
      data: {
        projectId,
        reportDate: data.reportDate,
        description: data.description.trim(),
        handler: data.handler?.trim() || null,
        resolvedDate: data.resolvedDate || null,
        cost: data.cost ? parseFloat(data.cost) : null,
        status: data.status || 'pending',
        note: data.note?.trim() || null,
      },
      include: { project: { select: { id: true, code: true, name: true } } },
    });
    return NextResponse.json(serializeRecord(record), { status: 201 });
  } catch (e) { return handleApiError(e); }
}

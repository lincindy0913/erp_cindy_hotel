import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';

export const dynamic = 'force-dynamic';

function serializeCount(c) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    items: (c.items || []).map(i => ({
      ...i,
      expectedQty: Number(i.expectedQty),
      actualQty:   Number(i.actualQty),
      variance:    Number(i.actualQty) - Number(i.expectedQty),
    })),
  };
}

const COUNT_INCLUDE = {
  project: { select: { id: true, code: true, name: true } },
  items: {
    include: { material: { select: { id: true, description: true, unit: true } } },
    orderBy: { id: 'asc' },
  },
};

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const where = projectId ? { projectId: parseInt(projectId) } : {};
    const counts = await prisma.engineeringStockCount.findMany({
      where, include: COUNT_INCLUDE, orderBy: [{ countDate: 'desc' }, { id: 'desc' }],
    });
    return NextResponse.json(counts.map(serializeCount));
  } catch (e) { return handleApiError(e); }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  try {
    const data = await request.json();
    if (!data.projectId) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇工程案', 400);
    if (!data.countDate)  return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫盤點日期', 400);
    const projectId = parseInt(data.projectId);
    await assertEngineeringProjectOpen(projectId);
    const items = Array.isArray(data.items) ? data.items : [];
    const count = await prisma.engineeringStockCount.create({
      data: {
        projectId,
        countDate: data.countDate,
        counter:   data.counter?.trim() || null,
        status:    data.status || 'draft',
        note:      data.note?.trim() || null,
        items: items.length ? {
          create: items.map(i => ({
            materialId:  i.materialId ? parseInt(i.materialId) : null,
            description: i.description?.trim() || null,
            unit:        i.unit?.trim() || null,
            expectedQty: parseFloat(i.expectedQty) || 0,
            actualQty:   parseFloat(i.actualQty) || 0,
            note:        i.note?.trim() || null,
          })),
        } : undefined,
      },
      include: COUNT_INCLUDE,
    });
    return NextResponse.json(serializeCount(count), { status: 201 });
  } catch (e) { return handleApiError(e); }
}

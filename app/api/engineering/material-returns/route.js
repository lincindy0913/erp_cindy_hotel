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

const INCLUDE = {
  project:  { select: { id: true, code: true, name: true } },
  material: { select: { id: true, description: true, quantity: true, unit: true } },
  product:  { select: { id: true, code: true, name: true } },
};

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const where = projectId ? { projectId: parseInt(projectId) } : {};
    const rows = await prisma.engineeringMaterialReturn.findMany({
      where, include: INCLUDE, orderBy: [{ returnDate: 'desc' }, { id: 'desc' }],
    });
    return NextResponse.json(rows.map(serialize));
  } catch (e) { return handleApiError(e); }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  try {
    const data = await request.json();
    if (!data.projectId) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇工程案', 400);
    if (!data.returnDate) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫退料日期', 400);
    if (!data.quantity || parseFloat(data.quantity) <= 0) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫退料數量', 400);
    const projectId = parseInt(data.projectId);
    await assertEngineeringProjectOpen(projectId);
    const row = await prisma.engineeringMaterialReturn.create({
      data: {
        projectId,
        materialId: data.materialId ? parseInt(data.materialId) : null,
        productId:  data.productId  ? parseInt(data.productId)  : null,
        description: data.description?.trim() || null,
        quantity:   parseFloat(data.quantity),
        unit:       data.unit?.trim() || null,
        returnDate: data.returnDate,
        reason:     data.reason?.trim() || null,
        status:     data.status || 'pending',
        note:       data.note?.trim() || null,
      },
      include: INCLUDE,
    });
    return NextResponse.json(serialize(row), { status: 201 });
  } catch (e) { return handleApiError(e); }
}

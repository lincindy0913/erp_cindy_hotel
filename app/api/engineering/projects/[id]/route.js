import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  const id = parseInt(params.id);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const project = await prisma.engineeringProject.findUnique({
      where: { id },
      include: {
        warehouseRef: true,
        departmentRef: true,
        contracts: { include: { supplier: true, terms: { orderBy: { termNo: 'asc' } } } },
        materials: { include: { product: true } },
      },
    });
    if (!project) return createErrorResponse('NOT_FOUND', '找不到工程案', 404);
    return NextResponse.json(serializeProject(project));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const id = parseInt(params.id);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();
    const update = {
      ...(data.code !== undefined && { code: String(data.code).trim() }),
      ...(data.name !== undefined && { name: String(data.name).trim() }),
      ...(data.clientName !== undefined && { clientName: data.clientName?.trim() || null }),
      ...(data.startDate !== undefined && { startDate: data.startDate || null }),
      ...(data.endDate !== undefined && { endDate: data.endDate || null }),
      ...(data.budget !== undefined && { budget: data.budget != null ? parseFloat(data.budget) : null }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.warehouse !== undefined && { warehouse: data.warehouse?.trim() || null }),
      ...(data.warehouseId !== undefined && { warehouseId: data.warehouseId ? parseInt(data.warehouseId) : null }),
      ...(data.departmentId !== undefined && { departmentId: data.departmentId ? parseInt(data.departmentId) : null }),
      ...(data.location !== undefined && { location: data.location?.trim() || null }),
      ...(data.buildingNo !== undefined && { buildingNo: data.buildingNo?.trim() || null }),
      ...(data.permitNo !== undefined && { permitNo: data.permitNo?.trim() || null }),
      ...(data.note !== undefined && { note: data.note?.trim() || null }),
    };
    if (data.warehouseId !== undefined && data.warehouseId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: parseInt(data.warehouseId) }, select: { name: true } });
      if (wh) update.warehouse = wh.name;
    }
    const project = await prisma.engineeringProject.update({
      where: { id },
      data: update,
    });
    return NextResponse.json(serializeProject(project));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const id = parseInt(params.id);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    await prisma.engineeringProject.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

function serializeProject(p) {
  return {
    ...p,
    budget: p.budget != null ? Number(p.budget) : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    contracts: (p.contracts || []).map(c => ({
      ...c,
      totalAmount: Number(c.totalAmount),
      terms: (c.terms || []).map(t => ({
        ...t,
        amount: Number(t.amount),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    })),
    materials: (p.materials || []).map(m => ({
      ...m,
      quantity: Number(m.quantity),
      unitPrice: Number(m.unitPrice),
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
  };
}

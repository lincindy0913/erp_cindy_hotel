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

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();
    const existing = await prisma.engineeringStockCount.findUnique({ where: { id }, select: { projectId: true, status: true } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到盤點單', 404);
    await assertEngineeringProjectOpen(existing.projectId);
    if (existing.status === 'confirmed' && data.status !== 'draft') {
      return createErrorResponse('VALIDATION_FAILED', '已確認的盤點單不可修改，請先還原為草稿', 400);
    }
    await prisma.$transaction(async (tx) => {
      await tx.engineeringStockCount.update({
        where: { id },
        data: {
          ...(data.countDate !== undefined && { countDate: data.countDate }),
          ...(data.counter   !== undefined && { counter:   data.counter?.trim() || null }),
          ...(data.status    !== undefined && { status:    data.status }),
          ...(data.note      !== undefined && { note:      data.note?.trim() || null }),
        },
      });
      if (Array.isArray(data.items)) {
        await tx.engineeringStockCountItem.deleteMany({ where: { countId: id } });
        if (data.items.length > 0) {
          await tx.engineeringStockCountItem.createMany({
            data: data.items.map(i => ({
              countId:     id,
              materialId:  i.materialId ? parseInt(i.materialId) : null,
              description: i.description?.trim() || null,
              unit:        i.unit?.trim() || null,
              expectedQty: parseFloat(i.expectedQty) || 0,
              actualQty:   parseFloat(i.actualQty)   || 0,
              note:        i.note?.trim() || null,
            })),
          });
        }
      }
    });
    const updated = await prisma.engineeringStockCount.findUnique({ where: { id }, include: COUNT_INCLUDE });
    return NextResponse.json(serializeCount(updated));
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const existing = await prisma.engineeringStockCount.findUnique({ where: { id }, select: { projectId: true, status: true } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到盤點單', 404);
    await assertEngineeringProjectOpen(existing.projectId);
    if (existing.status === 'confirmed') {
      return createErrorResponse('VALIDATION_FAILED', '已確認的盤點單不可刪除，請先還原為草稿', 400);
    }
    await prisma.engineeringStockCount.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e); }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const id = parseInt(params.id);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();
    const material = await prisma.engineeringMaterial.update({
      where: { id },
      data: {
        ...(data.productId !== undefined && { productId: data.productId ? parseInt(data.productId) : null }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(data.quantity !== undefined && { quantity: parseFloat(data.quantity) }),
        ...(data.unit !== undefined && { unit: data.unit?.trim() || null }),
        ...(data.unitPrice !== undefined && { unitPrice: parseFloat(data.unitPrice) }),
        ...(data.usedAt !== undefined && { usedAt: data.usedAt || null }),
        ...(data.note !== undefined && { note: data.note?.trim() || null }),
      },
      include: { project: true, product: true },
    });
    return NextResponse.json({
      ...material,
      quantity: Number(material.quantity),
      unitPrice: Number(material.unitPrice),
      createdAt: material.createdAt.toISOString(),
      updatedAt: material.updatedAt.toISOString(),
    });
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
    await prisma.engineeringMaterial.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

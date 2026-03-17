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

    // Fetch old material to compare quantity changes for inventory sync
    const oldMaterial = await prisma.engineeringMaterial.findUnique({
      where: { id },
      include: { project: { select: { id: true, warehouse: true, departmentRef: { select: { name: true } } } } },
    });
    if (!oldMaterial) return createErrorResponse('NOT_FOUND', '找不到材料', 404);

    const material = await prisma.engineeringMaterial.update({
      where: { id },
      data: {
        ...(data.productId !== undefined && { productId: data.productId ? parseInt(data.productId) : null }),
        ...(data.contractId !== undefined && { contractId: data.contractId ? parseInt(data.contractId) : null }),
        ...(data.termId !== undefined && { termId: data.termId ? parseInt(data.termId) : null }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(data.quantity !== undefined && { quantity: parseFloat(data.quantity) }),
        ...(data.unit !== undefined && { unit: data.unit?.trim() || null }),
        ...(data.unitPrice !== undefined && { unitPrice: parseFloat(data.unitPrice) }),
        ...(data.usedAt !== undefined && { usedAt: data.usedAt || null }),
        ...(data.note !== undefined && { note: data.note?.trim() || null }),
      },
      include: { project: true, product: true },
    });

    // Sync inventory requisition if quantity changed and product is in stock
    if (data.quantity !== undefined && oldMaterial.productId) {
      const oldQty = Math.round(Number(oldMaterial.quantity));
      const newQty = Math.round(parseFloat(data.quantity));
      const diff = newQty - oldQty;
      if (diff !== 0 && oldMaterial.project?.warehouse) {
        const product = await prisma.product.findUnique({ where: { id: oldMaterial.productId }, select: { isInStock: true } });
        if (product?.isInStock) {
          // Find existing requisition for this material
          const existingReq = await prisma.inventoryRequisition.findFirst({
            where: {
              productId: oldMaterial.productId,
              warehouse: oldMaterial.project.warehouse,
              note: { contains: `工程案 ID: ${oldMaterial.projectId}` },
            },
            orderBy: { id: 'desc' },
          });
          if (existingReq) {
            // Update existing requisition quantity
            await prisma.inventoryRequisition.update({
              where: { id: existingReq.id },
              data: { quantity: newQty },
            });
          } else if (diff > 0) {
            // Create new requisition for additional quantity
            const date = data.usedAt || oldMaterial.usedAt || new Date().toISOString().slice(0, 10);
            const prefix = `REQ-${date.replace(/-/g, '')}`;
            const last = await prisma.inventoryRequisition.findFirst({
              where: { requisitionNo: { startsWith: prefix } },
              orderBy: { requisitionNo: 'desc' },
            });
            const seq = last ? parseInt(last.requisitionNo.slice(-4), 10) + 1 : 1;
            const requisitionNo = `${prefix}-${String(seq).padStart(4, '0')}`;
            await prisma.inventoryRequisition.create({
              data: {
                requisitionNo,
                warehouse: oldMaterial.project.warehouse,
                department: oldMaterial.project.departmentRef?.name || null,
                productId: oldMaterial.productId,
                quantity: newQty,
                requisitionDate: date,
                status: '已領用',
                note: `工程材料領用（工程案 ID: ${oldMaterial.projectId}）`,
              },
            });
          }
        }
      }
    }

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
    // Fetch material before deletion to clean up inventory
    const material = await prisma.engineeringMaterial.findUnique({
      where: { id },
      include: { project: { select: { id: true, warehouse: true } } },
    });
    if (!material) return createErrorResponse('NOT_FOUND', '找不到材料', 404);

    // Delete associated inventory requisition
    if (material.productId && material.project?.warehouse) {
      const existingReq = await prisma.inventoryRequisition.findFirst({
        where: {
          productId: material.productId,
          warehouse: material.project.warehouse,
          note: { contains: `工程案 ID: ${material.projectId}` },
        },
        orderBy: { id: 'desc' },
      });
      if (existingReq) {
        await prisma.inventoryRequisition.delete({ where: { id: existingReq.id } });
      }
    }

    await prisma.engineeringMaterial.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

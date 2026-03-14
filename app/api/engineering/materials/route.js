import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const where = projectId ? { projectId: parseInt(projectId) } : {};
    const materials = await prisma.engineeringMaterial.findMany({
      where,
      include: { project: true, product: true, contract: true },
      orderBy: [{ projectId: 'asc' }, { usedAt: 'desc' }, { id: 'desc' }],
    });
    return NextResponse.json(materials.map(m => ({
      ...m,
      quantity: Number(m.quantity),
      unitPrice: Number(m.unitPrice),
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      contractNo: m.contract?.contractNo ?? null,
    })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  try {
    const data = await request.json();
    if (!data.projectId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇工程案', 400);
    }
    const projectId = parseInt(data.projectId);
    const quantity = parseFloat(data.quantity) || 0;
    if (quantity <= 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫數量', 400);
    }
    const productId = data.productId ? parseInt(data.productId) : null;
    const project = await prisma.engineeringProject.findUnique({
      where: { id: projectId },
      select: { warehouse: true, departmentRef: { select: { name: true } } },
    });
    const material = await prisma.engineeringMaterial.create({
      data: {
        projectId,
        productId,
        description: data.description?.trim() || null,
        quantity,
        unit: data.unit?.trim() || null,
        unitPrice: parseFloat(data.unitPrice) || 0,
        usedAt: data.usedAt || null,
        note: data.note?.trim() || null,
      },
      include: { project: true, product: true },
    });
    if (productId && project?.warehouse) {
      const product = await prisma.product.findUnique({ where: { id: productId }, select: { isInStock: true } });
      if (product?.isInStock) {
        const qty = Math.round(quantity);
        if (qty >= 1) {
          const date = data.usedAt || new Date().toISOString().slice(0, 10);
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
              warehouse: project.warehouse,
              department: project.departmentRef?.name || null,
              productId,
              quantity: qty,
              requisitionDate: date,
              status: '已領用',
              note: `工程材料領用（工程案 ID: ${projectId}）`,
            },
          });
        }
      }
    }
    return NextResponse.json({
      ...material,
      quantity: Number(material.quantity),
      unitPrice: Number(material.unitPrice),
      createdAt: material.createdAt.toISOString(),
      updatedAt: material.updatedAt.toISOString(),
    }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

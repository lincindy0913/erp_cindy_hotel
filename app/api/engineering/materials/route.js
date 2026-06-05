import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { todayStr } from '@/lib/localDate';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';
import { nextSequence } from '@/lib/sequence-generator';
import { serializeMaterial } from '@/lib/engineering-serializers';

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
      include: {
        project: true, product: true, contract: true, term: true,
        requisition: { select: { id: true, requisitionNo: true, requisitionDate: true } },
      },
      orderBy: [{ projectId: 'asc' }, { usedAt: 'desc' }, { id: 'desc' }],
    });
    return NextResponse.json(materials.map(m => ({
      ...serializeMaterial(m),
      contractNo: m.contract?.contractNo ?? null,
      termName: m.term?.termName ?? null,
      requisitionNo: m.requisition?.requisitionNo ?? null,
      requisitionDate: m.requisition?.requisitionDate ?? null,
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
    await assertEngineeringProjectOpen(projectId);
    const quantity = parseFloat(data.quantity) || 0;
    if (quantity <= 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫數量', 400);
    }
    const productId = data.productId ? parseInt(data.productId) : null;
    const material = await prisma.$transaction(async (tx) => {
      const proj = await tx.engineeringProject.findUnique({
        where: { id: projectId },
        select: { warehouse: true, departmentRef: { select: { name: true } } },
      });
      const mat = await tx.engineeringMaterial.create({
        data: {
          projectId,
          productId,
          contractId: data.contractId ? parseInt(data.contractId) : null,
          termId: data.termId ? parseInt(data.termId) : null,
          description: data.description?.trim() || null,
          quantity,
          unit: data.unit?.trim() || null,
          unitPrice: parseFloat(data.unitPrice) || 0,
          usedAt: data.usedAt || null,
          note: data.note?.trim() || null,
          requisitionId: data.requisitionId ? parseInt(data.requisitionId) : null,
        },
        include: { project: true, product: true },
      });
      if (productId && proj?.warehouse) {
        const prod = await tx.product.findUnique({ where: { id: productId }, select: { isInStock: true } });
        if (prod?.isInStock) {
          const qty = Math.round(quantity);
          if (qty >= 1) {
            const date = data.usedAt || todayStr();
            const prefix = `REQ-${date.replace(/-/g, '')}-`;
            const requisitionNo = await nextSequence(tx, 'inventoryRequisition', 'requisitionNo', prefix);
            await tx.inventoryRequisition.create({
              data: {
                requisitionNo,
                warehouse: proj.warehouse,
                department: proj.departmentRef?.name || null,
                productId,
                quantity: qty,
                requisitionDate: date,
                status: '已領用',
                note: `工程材料領用（工程案 ID: ${projectId}）`,
                sourceType: 'engineering_material',
                sourceRecordId: mat.id,
              },
            });
          }
        }
      }
      return mat;
    });
    return NextResponse.json(serializeMaterial(material), { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

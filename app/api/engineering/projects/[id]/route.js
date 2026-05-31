import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { serializeTerm, serializeMaterial } from '@/lib/engineering-serializers';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
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
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();

    if (data.code !== undefined) {
      const newCode = String(data.code).trim();
      const conflict = await prisma.engineeringProject.findUnique({
        where: { code: newCode },
        select: { id: true },
      });
      if (conflict && conflict.id !== id) {
        return createErrorResponse('CONFLICT', '工程代碼已存在', 409);
      }
    }

    const update = {
      ...(data.code !== undefined && { code: String(data.code).trim() }),
      ...(data.name !== undefined && { name: String(data.name).trim() }),
      ...(data.clientName !== undefined && { clientName: data.clientName?.trim() || null }),
      ...(data.clientContractAmount !== undefined && { clientContractAmount: data.clientContractAmount != null ? parseFloat(data.clientContractAmount) : null }),
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
    if (data.warehouseId !== undefined) {
      const [incomes, orders] = await Promise.all([
        prisma.engineeringIncome.count({ where: { projectId: id } }),
        prisma.paymentOrder.count({ where: { sourceType: 'engineering', sourceRecordId: id } }),
      ]);
      if (incomes + orders > 0) {
        return createErrorResponse(
          'FORBIDDEN',
          '此工程案已有收款或付款記錄，無法修改館別。如確需修改請聯絡系統管理員。',
          403
        );
      }
      if (data.warehouseId) {
        const wh = await prisma.warehouse.findUnique({ where: { id: parseInt(data.warehouseId) }, select: { name: true } });
        if (wh) update.warehouse = wh.name;
      }
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
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const [contracts, materials, incomes, inputInvCnt, outputInvCnt] = await Promise.all([
      prisma.engineeringContract.count({ where: { projectId: id } }),
      prisma.engineeringMaterial.count({ where: { projectId: id } }),
      prisma.engineeringIncome.count({ where: { projectId: id } }),
      prisma.engineeringInputInvoice.count({ where: { projectId: id } }),
      prisma.engineeringOutputInvoice.count({ where: { projectId: id } }),
    ]);

    const total = contracts + materials + incomes + inputInvCnt + outputInvCnt;
    if (total > 0) {
      const parts = [
        contracts    > 0 && `${contracts} 個合約`,
        materials    > 0 && `${materials} 筆材料`,
        incomes      > 0 && `${incomes} 筆收款`,
        inputInvCnt  > 0 && `${inputInvCnt} 張進項發票`,
        outputInvCnt > 0 && `${outputInvCnt} 張銷項發票`,
      ].filter(Boolean);
      return createErrorResponse(
        'HAS_DEPENDENCIES',
        `此工程案尚有關聯資料（${parts.join('、')}），請先刪除後再刪除工程案`,
        409
      );
    }

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
    clientContractAmount: p.clientContractAmount != null ? Number(p.clientContractAmount) : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    contracts: (p.contracts || []).map(c => ({
      ...c,
      totalAmount: Number(c.totalAmount),
      terms: (c.terms || []).map(serializeTerm),
    })),
    materials: (p.materials || []).map(serializeMaterial),
  };
}

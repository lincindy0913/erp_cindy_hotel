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
    const contract = await prisma.engineeringContract.findUnique({
      where: { id },
      include: { project: true, supplier: true, terms: { orderBy: { termNo: 'asc' } }, materials: true },
    });
    if (!contract) return createErrorResponse('NOT_FOUND', '找不到合約', 404);
    return NextResponse.json({
      ...contract,
      totalAmount: Number(contract.totalAmount),
      terms: contract.terms.map(t => ({
        ...t,
        amount: Number(t.amount),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      materials: (contract.materials || []).map(m => ({
        ...m,
        quantity: Number(m.quantity),
        unitPrice: Number(m.unitPrice),
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
    });
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
    if (data.content !== undefined && !String(data.content).trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫合約內容後再存檔', 400);
    }
    if (data.note !== undefined && !String(data.note).trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫備註後再存檔', 400);
    }
    const contract = await prisma.engineeringContract.update({
      where: { id },
      data: {
        ...(data.contractNo !== undefined && { contractNo: String(data.contractNo).trim() }),
        ...(data.totalAmount !== undefined && { totalAmount: parseFloat(data.totalAmount) }),
        ...(data.signDate !== undefined && { signDate: data.signDate || null }),
        ...(data.content !== undefined && { content: String(data.content).trim() }),
        ...(data.note !== undefined && { note: String(data.note).trim() }),
      },
      include: { project: true, supplier: true, terms: { orderBy: { termNo: 'asc' } }, materials: true },
    });
    if (Array.isArray(data.materials)) {
      await prisma.engineeringMaterial.deleteMany({ where: { contractId: id } });
      const contractNo = contract.contractNo;
      for (const row of data.materials) {
        const name = (row.materialName || row.description || '').trim();
        const qty = parseFloat(row.quantity) || 0;
        const amt = parseFloat(row.amount) || 0;
        if (!name || qty <= 0) continue;
        const unitPrice = qty > 0 ? amt / qty : 0;
        await prisma.engineeringMaterial.create({
          data: {
            projectId: contract.projectId,
            contractId: id,
            description: name,
            quantity: qty,
            unit: (row.unit || '式').trim() || '式',
            unitPrice,
            usedAt: null,
            note: contractNo ? `合約 ${contractNo}` : null,
          },
        });
      }
      const updated = await prisma.engineeringContract.findUnique({
        where: { id },
        include: { project: true, supplier: true, terms: { orderBy: { termNo: 'asc' } }, materials: true },
      });
      return NextResponse.json({
        ...updated,
        totalAmount: Number(updated.totalAmount),
        terms: updated.terms.map(t => ({
          ...t,
          amount: Number(t.amount),
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
        materials: (updated.materials || []).map(m => ({
          ...m,
          quantity: Number(m.quantity),
          unitPrice: Number(m.unitPrice),
          createdAt: m.createdAt.toISOString(),
          updatedAt: m.updatedAt.toISOString(),
        })),
      });
    }
    return NextResponse.json({
      ...contract,
      totalAmount: Number(contract.totalAmount),
      terms: contract.terms.map(t => ({
        ...t,
        amount: Number(t.amount),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      materials: (contract.materials || []).map(m => ({
        ...m,
        quantity: Number(m.quantity),
        unitPrice: Number(m.unitPrice),
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
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
    await prisma.engineeringContract.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

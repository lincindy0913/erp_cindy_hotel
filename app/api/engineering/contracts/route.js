import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';
import { serializeContract } from '@/lib/engineering-serializers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const where = projectId ? { projectId: parseInt(projectId) } : {};
    const contracts = await prisma.engineeringContract.findMany({
      where,
      include: {
        project: true,
        supplier: true,
        terms: { orderBy: { termNo: 'asc' } },
        materials: true,
      },
      orderBy: { id: 'desc' },
    });
    return NextResponse.json(contracts.map(serializeContract));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  try {
    const data = await request.json();
    if (!data.projectId || !data.supplierId || !data.contractNo?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫工程案、廠商、合約編號', 400);
    }
    if (!data.content?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫合約內容後再存檔', 400);
    }
    if (!data.note?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫備註後再存檔', 400);
    }
    const projectId = parseInt(data.projectId);
    await assertEngineeringProjectOpen(projectId);
    const supplierId = parseInt(data.supplierId);
    const contractNo = String(data.contractNo).trim();
    const totalAmount = parseFloat(data.totalAmount) || 0;
    const retentionRate = Math.min(1, Math.max(0, parseFloat(data.retentionRate) || 0));
    const terms = Array.isArray(data.terms) ? data.terms : [];
    const materials = Array.isArray(data.materials) ? data.materials : [];

    if (terms.length > 0) {
      const regularSum = terms.filter(t => (t.termType || 'regular') === 'regular').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      if (totalAmount > 0 && Math.abs(regularSum - totalAmount) > 0.01) {
        return createErrorResponse(
          'VALIDATION_FAILED',
          `一般期數合計 NT$${regularSum.toLocaleString()} 與合約總金額 NT$${totalAmount.toLocaleString()} 不符，請修正後再存檔`,
          400
        );
      }
    }

    const existing = await prisma.engineeringContract.findUnique({
      where: { projectId_contractNo: { projectId, contractNo } },
    });
    if (existing) {
      return createErrorResponse('CONFLICT_UNIQUE', '該工程案下合約編號已存在', 409);
    }

    let contractId;
    await prisma.$transaction(async (tx) => {
      const contract = await tx.engineeringContract.create({
        data: {
          projectId,
          supplierId,
          contractNo,
          totalAmount,
          retentionRate,
          signDate: data.signDate || null,
          content: String(data.content).trim(),
          note: String(data.note).trim(),
          terms: terms.length
            ? {
                create: terms.map((t, i) => ({
                  termNo: i + 1,
                  termType: t.termType || 'regular',
                  termName: t.termName || `第${i + 1}期`,
                  content: t.content?.trim() || null,
                  amount: parseFloat(t.amount) || 0,
                  retentionAmount: parseFloat(t.retentionAmount) || 0,
                  dueDate: t.dueDate || null,
                  status: 'pending',
                  note: t.note?.trim() || null,
                })),
              }
            : undefined,
        },
      });
      for (const row of materials) {
        const name = (row.materialName || row.description || '').trim();
        const qty  = parseFloat(row.quantity) || 0;
        const amt  = parseFloat(row.amount)   || 0;
        if (!name || qty <= 0) continue;
        const unitPrice   = qty > 0 ? Math.round((amt / qty) * 100) / 100 : 0;
        const matTotal = amt > 0 ? amt : null;
        await tx.engineeringMaterial.create({
          data: {
            projectId: contract.projectId,
            contractId: contract.id,
            description: name,
            quantity: qty,
            unit: (row.unit || '式').trim() || '式',
            unitPrice,
            totalAmount: matTotal,
            usedAt: null,
            note: contractNo ? `合約 ${contractNo}` : null,
          },
        });
      }
      contractId = contract.id;
    });
    const updated = await prisma.engineeringContract.findUnique({
      where: { id: contractId },
      include: { project: true, supplier: true, terms: { orderBy: { termNo: 'asc' } }, materials: true },
    });
    return NextResponse.json(serializeContract(updated), { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

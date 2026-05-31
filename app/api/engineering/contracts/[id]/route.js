import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';
import { serializeContract } from '@/lib/engineering-serializers';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const contract = await prisma.engineeringContract.findUnique({
      where: { id },
      include: { project: true, supplier: true, terms: { orderBy: { termNo: 'asc' } }, materials: true },
    });
    if (!contract) return createErrorResponse('NOT_FOUND', '找不到合約', 404);
    return NextResponse.json(serializeContract(contract));
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

    // Check if contract has any paid terms — prevent editing paid contracts
    const existingContract = await prisma.engineeringContract.findUnique({
      where: { id },
      include: { terms: true },
    });
    if (!existingContract) return createErrorResponse('NOT_FOUND', '找不到合約', 404);
    await assertEngineeringProjectOpen(existingContract.projectId);
    if (existingContract.status === 'completed') {
      const hasBlockedField = ['contractNo', 'totalAmount'].some(f => data[f] !== undefined)
        || Array.isArray(data.materials);
      if (hasBlockedField) {
        return createErrorResponse(
          'VALIDATION_FAILED',
          '已完成付款的合約不可修改合約編號或金額，如需修改請先取消付款狀態',
          400
        );
      }
    }

    if (data.totalAmount !== undefined) {
      const newTotal = parseFloat(data.totalAmount);
      const termsSum = existingContract.terms.reduce((s, t) => s + Number(t.amount), 0);
      if (termsSum > 0 && Math.abs(termsSum - newTotal) > 0.01) {
        return createErrorResponse(
          'VALIDATION_FAILED',
          `現有期數合計 NT$${termsSum.toLocaleString()} 與新合約總金額 NT$${newTotal.toLocaleString()} 不符`,
          400
        );
      }
    }

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
      await prisma.$transaction(async (tx) => {
        // 清理舊 materials 對應的 InventoryRequisition（有 productId 才有關聯）
        const oldMaterials = await tx.engineeringMaterial.findMany({
          where: { contractId: id, productId: { not: null } },
          include: { project: { select: { warehouse: true } } },
        });
        for (const m of oldMaterials) {
          if (m.project?.warehouse) {
            const req = await tx.inventoryRequisition.findFirst({
              where: {
                productId: m.productId,
                warehouse: m.project.warehouse,
                note: { contains: `工程案 ID: ${m.projectId}` },
              },
              orderBy: { id: 'desc' },
            });
            if (req) await tx.inventoryRequisition.delete({ where: { id: req.id } });
          }
        }

        await tx.engineeringMaterial.deleteMany({ where: { contractId: id } });

        const contractNo = contract.contractNo;
        for (const row of data.materials) {
          const name = (row.materialName || row.description || '').trim();
          const qty  = parseFloat(row.quantity) || 0;
          const amt  = parseFloat(row.amount)   || 0;
          if (!name || qty <= 0) continue;
          const unitPrice   = qty > 0 ? Math.round((amt / qty) * 100) / 100 : 0;
          const totalAmount = amt > 0 ? amt : null;
          await tx.engineeringMaterial.create({
            data: {
              projectId: contract.projectId,
              contractId: id,
              description: name,
              quantity: qty,
              unit: (row.unit || '式').trim() || '式',
              unitPrice,
              totalAmount,
              usedAt: null,
              note: contractNo ? `合約 ${contractNo}` : null,
            },
          });
        }
      });
      const updated = await prisma.engineeringContract.findUnique({
        where: { id },
        include: { project: true, supplier: true, terms: { orderBy: { termNo: 'asc' } }, materials: true },
      });
      return NextResponse.json(serializeContract(updated));
    }
    return NextResponse.json(serializeContract(contract));
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
    // Check if contract has any paid terms — prevent deleting
    const contract = await prisma.engineeringContract.findUnique({
      where: { id },
      include: { terms: { where: { status: 'paid' } } },
    });
    if (!contract) return createErrorResponse('NOT_FOUND', '找不到合約', 404);
    await assertEngineeringProjectOpen(contract.projectId);
    if (contract.terms.length > 0) {
      return createErrorResponse('VALIDATION_FAILED', '合約含有已付款的期數，不可刪除', 400);
    }

    const [materialCnt, invoiceCnt, orderCnt] = await Promise.all([
      prisma.engineeringMaterial.count({ where: { contractId: id } }),
      prisma.engineeringInputInvoice.count({ where: { contractId: id } }),
      prisma.paymentOrder.count({ where: { sourceType: 'engineering_contract', sourceRecordId: id } }),
    ]);

    const total = materialCnt + invoiceCnt + orderCnt;
    if (total > 0) {
      const parts = [
        materialCnt > 0 && `${materialCnt} 筆材料`,
        invoiceCnt  > 0 && `${invoiceCnt} 張進項發票`,
        orderCnt    > 0 && `${orderCnt} 張付款單`,
      ].filter(Boolean);
      return createErrorResponse(
        'HAS_DEPENDENCIES',
        `此合約尚有關聯資料（${parts.join('、')}），請先刪除後再刪除合約`,
        409
      );
    }

    await prisma.engineeringContract.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

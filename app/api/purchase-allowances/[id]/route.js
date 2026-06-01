import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';
import { ALLOWANCE_STATUS } from '@/lib/allowance-statuses';

export const dynamic = 'force-dynamic';

// GET: 單筆折讓單
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);
    const record = await prisma.purchaseAllowance.findUnique({
      where: { id },
      include: { details: true },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到折讓單', 404);

    if (record.warehouse) {
      const wa = assertWarehouseAccess(auth.session, record.warehouse);
      if (!wa.ok) return wa.response;
    }

    return NextResponse.json({
      ...record,
      amount: Number(record.amount),
      tax: Number(record.tax),
      totalAmount: Number(record.totalAmount),
      details: record.details.map(d => ({
        ...d,
        quantity: Number(d.quantity),
        unitPrice: Number(d.unitPrice),
        subtotal: Number(d.subtotal),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT: 編輯折讓單（僅草稿可編輯）
export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);
    const data = await request.json();

    const existing = await prisma.purchaseAllowance.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到折讓單', 404);

    if (existing.warehouse) {
      const wa = assertWarehouseAccess(auth.session, existing.warehouse);
      if (!wa.ok) return wa.response;
    }

    if (existing.status !== ALLOWANCE_STATUS.DRAFT) {
      return createErrorResponse('VALIDATION_FAILED', `無法編輯：目前狀態為「${existing.status}」，僅「${ALLOWANCE_STATUS.DRAFT}」可編輯`, 400);
    }

    // ── cross-check 金額一致性 ──────────────────────────────
    if (data.totalAmount !== undefined || data.amount !== undefined || data.tax !== undefined) {
      const amt   = parseFloat(data.amount   ?? existing.amount   ?? 0);
      const tax   = parseFloat(data.tax      ?? existing.tax      ?? 0);
      const total = parseFloat(data.totalAmount ?? existing.totalAmount ?? 0);
      if (Math.abs(amt + tax - total) > 0.5) {
        return createErrorResponse('VALIDATION_FAILED',
          `totalAmount(${total}) 應等於 amount(${amt}) + tax(${tax})`, 400);
      }
    }
    if (data.details?.length > 0 && data.totalAmount !== undefined) {
      const detailSum = data.details.reduce((s, d) => s + parseFloat(d.subtotal || 0), 0);
      const total = parseFloat(data.totalAmount);
      if (Math.abs(detailSum - total) > 0.5) {
        return createErrorResponse('VALIDATION_FAILED',
          `明細小計合計(${detailSum.toFixed(2)}) 與折讓總額(${total}) 不符`, 400);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // ── Diff-based detail sync（同 P3 策略，保留既有 detail ID）──
      if (data.details !== undefined) {
        const incomingDetails = data.details || [];
        const currentDetails = await tx.allowanceDetail.findMany({
          where: { allowanceId: id },
          select: { id: true },
        });
        const currentIds = new Set(currentDetails.map(d => d.id));
        const incomingIds = new Set(
          incomingDetails.filter(d => d.id || d.detailId)
                         .map(d => parseInt(d.id ?? d.detailId))
        );

        // 刪除 incoming 未帶 id 的舊明細
        const toDeleteIds = [...currentIds].filter(did => !incomingIds.has(did));
        if (toDeleteIds.length > 0) {
          await tx.allowanceDetail.deleteMany({ where: { id: { in: toDeleteIds }, allowanceId: id } });
        }

        for (const d of incomingDetails) {
          const detailData = {
            productName: d.productName?.trim() || null,
            quantity:    parseFloat(d.quantity  || 0),
            unitPrice:   parseFloat(d.unitPrice  || 0),
            subtotal:    parseFloat(d.subtotal   || 0),
            reason:      d.reason?.trim()        || null,
          };
          const did = d.id != null ? parseInt(d.id) : d.detailId != null ? parseInt(d.detailId) : null;
          if (did && currentIds.has(did)) {
            await tx.allowanceDetail.update({ where: { id: did }, data: detailData });
          } else {
            await tx.allowanceDetail.create({ data: { allowanceId: id, ...detailData } });
          }
        }
      }

      const record = await tx.purchaseAllowance.update({
        where: { id },
        data: {
          allowanceType: data.allowanceType || existing.allowanceType || '折讓',
          allowanceDate: data.allowanceDate || existing.allowanceDate,
          supplierId: data.supplierId !== undefined ? (data.supplierId ? parseInt(data.supplierId) : null) : existing.supplierId,
          supplierName: data.supplierName !== undefined ? (data.supplierName?.trim() || null) : existing.supplierName,
          warehouse: data.warehouse !== undefined ? (data.warehouse?.trim() || null) : existing.warehouse,
          purchaseNo: data.purchaseNo !== undefined ? (data.purchaseNo?.trim() || null) : existing.purchaseNo,
          invoiceNo: data.invoiceNo !== undefined ? (data.invoiceNo?.trim() || null) : existing.invoiceNo,
          paymentOrderNo: data.paymentOrderNo !== undefined ? (data.paymentOrderNo?.trim() || null) : existing.paymentOrderNo,
          amount: data.amount !== undefined ? parseFloat(data.amount) : existing.amount,
          tax: data.tax !== undefined ? parseFloat(data.tax) : existing.tax,
          totalAmount: data.totalAmount !== undefined ? parseFloat(data.totalAmount) : existing.totalAmount,
          creditNoteNo: data.creditNoteNo !== undefined ? (data.creditNoteNo?.trim() || null) : existing.creditNoteNo,
          reason: data.reason !== undefined ? (data.reason?.trim() || null) : existing.reason,
          note: data.note !== undefined ? (data.note?.trim() || null) : existing.note,
        },
        include: { details: true },
      });
      return record;
    });

    return NextResponse.json({
      ...updated,
      amount: Number(updated.amount),
      tax: Number(updated.tax),
      totalAmount: Number(updated.totalAmount),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: 刪除折讓單（僅草稿可刪除）
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);
    const existing = await prisma.purchaseAllowance.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到折讓單', 404);

    if (existing.warehouse) {
      const wa = assertWarehouseAccess(auth.session, existing.warehouse);
      if (!wa.ok) return wa.response;
    }

    if (existing.status !== ALLOWANCE_STATUS.DRAFT) {
      return createErrorResponse('VALIDATION_FAILED', `無法刪除：目前狀態為「${existing.status}」，僅「${ALLOWANCE_STATUS.DRAFT}」可刪除`, 400);
    }

    await prisma.purchaseAllowance.delete({ where: { id } });
    return NextResponse.json({ message: '折讓單已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}

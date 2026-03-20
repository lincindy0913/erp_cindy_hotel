import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET: 單筆折讓單
export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    const record = await prisma.purchaseAllowance.findUnique({
      where: { id },
      include: { details: true },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到折讓單', 404);

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
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.purchaseAllowance.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到折讓單', 404);
    if (existing.status !== '草稿') {
      return createErrorResponse('VALIDATION_FAILED', `無法編輯：目前狀態為「${existing.status}」，僅「草稿」可編輯`, 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Delete old details and recreate
      await tx.allowanceDetail.deleteMany({ where: { allowanceId: id } });

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
          reason: data.reason !== undefined ? (data.reason?.trim() || null) : existing.reason,
          note: data.note !== undefined ? (data.note?.trim() || null) : existing.note,
          details: data.details?.length > 0 ? {
            create: data.details.map(d => ({
              productName: d.productName?.trim() || null,
              quantity: parseFloat(d.quantity || 0),
              unitPrice: parseFloat(d.unitPrice || 0),
              subtotal: parseFloat(d.subtotal || 0),
              reason: d.reason?.trim() || null,
            })),
          } : undefined,
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
  try {
    const id = parseInt(params.id);
    const existing = await prisma.purchaseAllowance.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到折讓單', 404);
    if (existing.status !== '草稿') {
      return createErrorResponse('VALIDATION_FAILED', `無法刪除：目前狀態為「${existing.status}」，僅「草稿」可刪除`, 400);
    }

    await prisma.purchaseAllowance.delete({ where: { id } });
    return NextResponse.json({ message: '折讓單已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}

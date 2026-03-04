import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.salesMaster.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '發票不存在', 404);
    }

    // 刪除舊明細，重新建立
    await prisma.salesDetail.deleteMany({ where: { salesId: id } });

    const updated = await prisma.salesMaster.update({
      where: { id },
      data: {
        invoiceNo: data.invoiceNo || existing.invoiceNo,
        invoiceDate: data.invoiceDate || existing.invoiceDate,
        invoiceTitle: data.invoiceTitle !== undefined ? data.invoiceTitle : existing.invoiceTitle,
        taxType: data.taxType !== undefined ? data.taxType : existing.taxType,
        invoiceAmount: data.invoiceAmount !== undefined ? (data.invoiceAmount ? parseFloat(data.invoiceAmount) : null) : existing.invoiceAmount,
        supplierDiscount: data.supplierDiscount !== undefined ? parseFloat(data.supplierDiscount || 0) : existing.supplierDiscount,
        status: data.status || existing.status,
        amount: parseFloat(data.amount || 0),
        tax: parseFloat(data.tax || 0),
        totalAmount: data.totalAmount ? parseFloat(data.totalAmount) : (parseFloat(data.amount || 0) + parseFloat(data.tax || 0)),
        details: data.items ? {
          create: data.items.map(item => ({
            purchaseItemId: item.purchaseItemId || '',
            purchaseId: item.purchaseId ? parseInt(item.purchaseId) : null,
            purchaseNo: item.purchaseNo || null,
            purchaseDate: item.purchaseDate || null,
            warehouse: item.warehouse || null,
            supplierId: item.supplierId ? parseInt(item.supplierId) : null,
            productId: item.productId ? parseInt(item.productId) : null,
            quantity: item.quantity ? parseInt(item.quantity) : null,
            unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : null,
            note: item.note || null,
            subtotal: item.subtotal ? parseFloat(item.subtotal) : null
          }))
        } : undefined
      },
      include: { details: true }
    });

    const result = {
      id: updated.id,
      salesNo: updated.salesNo,
      invoiceNo: updated.invoiceNo,
      invoiceDate: updated.invoiceDate,
      status: updated.status,
      amount: Number(updated.amount),
      tax: Number(updated.tax),
      totalAmount: Number(updated.totalAmount),
      items: updated.details.map(d => ({
        purchaseItemId: d.purchaseItemId,
        purchaseId: d.purchaseId,
        purchaseNo: d.purchaseNo,
        purchaseDate: d.purchaseDate,
        warehouse: d.warehouse,
        supplierId: d.supplierId,
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: d.unitPrice ? Number(d.unitPrice) : null,
        note: d.note,
        subtotal: d.subtotal ? Number(d.subtotal) : null
      })),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('更新發票錯誤:', error);
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.salesMaster.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '發票不存在', 404);
    }

    await prisma.salesMaster.delete({ where: { id } });
    return NextResponse.json({ message: '發票已刪除，相關進貨單品項已可重新核銷' });
  } catch (error) {
    console.error('刪除發票錯誤:', error);
    return handleApiError(error);
  }
}

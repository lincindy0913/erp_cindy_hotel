import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.purchaseMaster.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '進貨單不存在', 404);
    }

    await prisma.purchaseDetail.deleteMany({ where: { purchaseId: id } });

    const updated = await prisma.purchaseMaster.update({
      where: { id },
      data: {
        warehouse: data.warehouse || '',
        department: data.department || '',
        supplierId: parseInt(data.supplierId),
        purchaseDate: data.purchaseDate,
        paymentTerms: data.paymentTerms || '月結',
        status: data.status,
        amount: parseFloat(data.amount || 0),
        tax: 0,
        totalAmount: data.totalAmount ? parseFloat(data.totalAmount) : parseFloat(data.amount || 0),
        details: {
          create: (data.items || []).map(item => ({
            productId: parseInt(item.productId),
            quantity: parseInt(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            note: item.note || '',
            status: item.status || '待入庫',
            inventoryWarehouse: item.inventoryWarehouse || null
          }))
        }
      },
      include: { details: true }
    });

    const result = {
      id: updated.id,
      purchaseNo: updated.purchaseNo,
      warehouse: updated.warehouse,
      department: updated.department,
      supplierId: updated.supplierId,
      purchaseDate: updated.purchaseDate,
      paymentTerms: updated.paymentTerms,
      taxType: updated.taxType,
      amount: Number(updated.amount),
      tax: Number(updated.tax),
      totalAmount: Number(updated.totalAmount),
      status: updated.status,
      items: updated.details.map(d => ({
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: Number(d.unitPrice),
        note: d.note || '',
        status: d.status,
        inventoryWarehouse: d.inventoryWarehouse || ''
      })),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    };

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const existing = await prisma.purchaseMaster.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '進貨單不存在', 404);
    }

    await prisma.purchaseMaster.delete({ where: { id } });
    return NextResponse.json({ message: '進貨單已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}

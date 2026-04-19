import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

/** GET: 單筆發票（供 /sales?edit=id 連動編輯） */
export async function GET(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_EDIT]);
  if (!auth.ok) return auth.response;
  try {
    const id = parseInt(params.id);
    const invoice = await prisma.salesMaster.findUnique({
      where: { id },
      include: { details: true }
    });
    if (!invoice) return createErrorResponse('NOT_FOUND', '發票不存在', 404);

    const paymentOrders = await prisma.paymentOrder.findMany({
      where: { status: { in: ['草稿', '待出納', '已執行'] } },
      select: { invoiceIds: true, status: true }
    });
    const idNum = Number(id);
    const related = paymentOrders.filter(o => {
      if (!Array.isArray(o.invoiceIds)) return false;
      return o.invoiceIds.some(invId => Number(invId) === idNum || invId === id);
    });
    let paymentStatus = '未付款';
    if (related.length > 0) {
      if (related.some(o => o.status === '已執行')) paymentStatus = '已付款';
      else if (related.some(o => o.status === '待出納')) paymentStatus = '待出納';
      else if (related.some(o => o.status === '草稿')) paymentStatus = '草稿';
    }

    let supplierName = '未知廠商';
    let supplierId = null;
    let warehouse = '';
    if (invoice.details.length > 0 && invoice.details[0].purchaseId) {
      const purchase = await prisma.purchaseMaster.findUnique({
        where: { id: invoice.details[0].purchaseId },
        include: { supplier: { select: { name: true } } }
      });
      if (purchase) {
        supplierName = purchase.supplier?.name || '未知廠商';
        supplierId = purchase.supplierId;
        warehouse = purchase.warehouse || '';
      }
    }

    const result = {
      id: invoice.id,
      salesNo: invoice.salesNo,
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      invoiceTitle: invoice.invoiceTitle,
      taxType: invoice.taxType,
      invoiceAmount: invoice.invoiceAmount ? Number(invoice.invoiceAmount) : null,
      supplierDiscount: invoice.supplierDiscount ? Number(invoice.supplierDiscount) : 0,
      amount: Number(invoice.amount),
      tax: Number(invoice.tax),
      totalAmount: Number(invoice.totalAmount),
      status: invoice.status,
      invoiceType: invoice.invoiceType,
      items: invoice.details.map(d => ({
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
      supplierName,
      supplierId,
      warehouse,
      paymentStatus
    };
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.SALES_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.salesMaster.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '發票不存在', 404);
    }

    // 若此發票已有付款流程（草稿 / 待出納 / 已執行），禁止修改
    const paymentOrders = await prisma.paymentOrder.findMany({
      where: {
        status: { in: ['草稿', '待出納', '已執行'] }
      },
      select: { invoiceIds: true, status: true }
    });
    const idNum = Number(id);
    const related = paymentOrders.filter(o => {
      if (!Array.isArray(o.invoiceIds)) return false;
      return o.invoiceIds.some(invId => Number(invId) === idNum || invId === id);
    });
    if (related.length > 0) {
      const hasExecuted = related.some(o => o.status === '已執行');
      const hasPending = related.some(o => o.status === '待出納');
      const hasDraft = related.some(o => o.status === '草稿');
      if (hasDraft || hasPending || hasExecuted) {
        const statusText = hasExecuted ? '已付款' : hasPending ? '待出納' : '草稿';
        return createErrorResponse(
          'VALIDATION_FAILED',
          `此發票目前付款狀態為「${statusText}」，不可修改發票資訊。`,
          400
        );
      }
    }

    // 刪除舊明細，重新建立
    await prisma.salesDetail.deleteMany({ where: { salesId: id } });

    const updated = await prisma.salesMaster.update({
      where: { id },
      data: {
        invoiceNo: data.invoiceNo || existing.invoiceNo,
        invoiceDate: data.invoiceDate || existing.invoiceDate,
        invoiceTitle: data.invoiceTitle !== undefined ? data.invoiceTitle : existing.invoiceTitle,
        invoiceType: data.invoiceType !== undefined ? data.invoiceType : existing.invoiceType,
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
      invoiceType: updated.invoiceType,
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
    console.error('更新發票錯誤:', error.message || error);
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.SALES_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const existing = await prisma.salesMaster.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '發票不存在', 404);
    }

    // 已付款的發票不可刪除
    const paymentOrders = await prisma.paymentOrder.findMany({
      where: { status: '已執行' },
      select: { invoiceIds: true }
    });
    const idNum = Number(id);
    const isPaid = paymentOrders.some(o => {
      if (!Array.isArray(o.invoiceIds)) return false;
      return o.invoiceIds.some(invId => Number(invId) === idNum || invId === id);
    });
    if (isPaid) {
      return createErrorResponse(
        'VALIDATION_FAILED',
        '此發票為已付款狀態，不可刪除。',
        400
      );
    }

    await prisma.salesMaster.delete({ where: { id } });
    return NextResponse.json({ message: '發票已刪除，相關進貨單品項已可重新核銷' });
  } catch (error) {
    console.error('刪除發票錯誤:', error.message || error);
    return handleApiError(error);
  }
}

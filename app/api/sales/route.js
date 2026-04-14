import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertPeriodOpen } from '@/lib/period-lock';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.SALES_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const sales = await prisma.salesMaster.findMany({
      include: { details: true },
      orderBy: { id: 'asc' }
    });

    // 依付款單狀態計算每張發票的「付款狀態」（套館別限制）
    const paymentOrderWhere = {};
    const wfPO = applyWarehouseFilter(auth.session, paymentOrderWhere);
    if (!wfPO.ok) return wfPO.response;

    const paymentOrders = await prisma.paymentOrder.findMany({
      where: paymentOrderWhere,
      select: {
        invoiceIds: true,
        status: true
      }
    });

    function getPaymentStatusForInvoice(invoiceId) {
      const idNum = Number(invoiceId);
      const related = paymentOrders.filter(o => {
        if (!Array.isArray(o.invoiceIds)) return false;
        return o.invoiceIds.some(id => Number(id) === idNum || id === invoiceId);
      });
      if (related.length === 0) return '未付款';
      if (related.some(o => o.status === '已退貨')) return '已退貨';
      if (related.some(o => o.status === '已執行')) return '已付款';
      if (related.some(o => o.status === '待出納')) return '待出納';
      if (related.some(o => o.status === '草稿')) return '草稿';
      return '未付款';
    }

    const result = sales.map(s => ({
      id: s.id,
      salesNo: s.salesNo,
      invoiceNo: s.invoiceNo,
      invoiceDate: s.invoiceDate,
      invoiceTitle: s.invoiceTitle,
      taxType: s.taxType,
      invoiceAmount: s.invoiceAmount ? Number(s.invoiceAmount) : null,
      supplierDiscount: s.supplierDiscount ? Number(s.supplierDiscount) : 0,
      amount: Number(s.amount),
      tax: Number(s.tax),
      totalAmount: Number(s.totalAmount),
      status: s.status,
      paymentStatus: getPaymentStatusForInvoice(s.id),
      items: s.details.map(d => ({
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
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('查詢銷貨單錯誤:', error.message || error);
    return NextResponse.json([]);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.SALES_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.invoiceNo || !data.items || data.items.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位：發票號碼和核銷品項', 400);
    }

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const todayPrefix = `INV-${today}-`;
    const existingCount = await prisma.salesMaster.count({
      where: { salesNo: { startsWith: todayPrefix } }
    });
    const salesNo = `${todayPrefix}${String(existingCount + 1).padStart(4, '0')}`;

    const invoiceDate = data.invoiceDate || new Date().toISOString().split('T')[0];
    const warehouse = data.warehouse || (data.items && data.items[0] && data.items[0].warehouse) || undefined;

    const newInvoice = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, invoiceDate, warehouse);

      return tx.salesMaster.create({
        data: {
          salesNo,
          invoiceNo: data.invoiceNo,
          invoiceDate,
          invoiceTitle: data.invoiceTitle || null,
          taxType: data.taxType || null,
          invoiceAmount: data.invoiceAmount ? parseFloat(data.invoiceAmount) : null,
          supplierDiscount: data.supplierDiscount ? parseFloat(data.supplierDiscount) : 0,
          amount: parseFloat(data.amount || 0),
          tax: parseFloat(data.tax || 0),
          totalAmount: data.totalAmount ? parseFloat(data.totalAmount) : (parseFloat(data.amount || 0) + parseFloat(data.tax || 0)),
          status: data.status || '待核銷',
          details: {
            create: (data.items || []).map(item => ({
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
          }
        },
        include: { details: true }
      });
    });

    const result = {
      id: newInvoice.id,
      salesNo: newInvoice.salesNo,
      invoiceNo: newInvoice.invoiceNo,
      invoiceDate: newInvoice.invoiceDate,
      invoiceTitle: newInvoice.invoiceTitle,
      taxType: newInvoice.taxType,
      invoiceAmount: newInvoice.invoiceAmount ? Number(newInvoice.invoiceAmount) : null,
      supplierDiscount: newInvoice.supplierDiscount ? Number(newInvoice.supplierDiscount) : 0,
      amount: Number(newInvoice.amount),
      tax: Number(newInvoice.tax),
      totalAmount: Number(newInvoice.totalAmount),
      status: newInvoice.status,
      items: newInvoice.details.map(d => ({
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
      createdAt: newInvoice.createdAt.toISOString(),
      updatedAt: newInvoice.updatedAt.toISOString()
    };

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('建立發票錯誤:', error.message || error);
    return handleApiError(error);
  }
}

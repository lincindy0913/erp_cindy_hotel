import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.SALES_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page  = Math.max(1, parseInt(searchParams.get('page'))  || 1);
    const limit = Math.min(200, parseInt(searchParams.get('limit')) || 50);
    const dateFrom    = searchParams.get('dateFrom');
    const dateTo      = searchParams.get('dateTo');
    const warehouse   = searchParams.get('warehouse');
    const invoiceType = searchParams.get('invoiceType');
    const invoiceTitle = searchParams.get('invoiceTitle');

    const where = {};
    if (dateFrom || dateTo) {
      where.invoiceDate = {};
      if (dateFrom) where.invoiceDate.gte = dateFrom;
      if (dateTo)   where.invoiceDate.lte = dateTo;
    }
    if (invoiceTitle) where.invoiceTitle = invoiceTitle;
    // 折讓 是前端 allowance 資料，不在 SalesMaster 裡
    if (invoiceType && invoiceType !== '折讓') where.invoiceType = invoiceType;
    if (warehouse) where.details = { some: { warehouse } };

    const skip = (page - 1) * limit;

    const [total, sales] = await Promise.all([
      prisma.salesMaster.count({ where }),
      prisma.salesMaster.findMany({
        where,
        include: { details: true },
        orderBy: { invoiceDate: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Batch-fetch purchases to avoid N+1
    const purchaseIds = [...new Set(
      sales.flatMap(s => s.details.map(d => d.purchaseId).filter(Boolean))
    )];
    const purchases = purchaseIds.length > 0
      ? await prisma.purchaseMaster.findMany({
          where: { id: { in: purchaseIds } },
          select: { id: true, supplierId: true, warehouse: true, supplier: { select: { name: true } } },
        })
      : [];
    const purchaseMap = new Map(purchases.map(p => [p.id, p]));

    // Fetch payment orders for payment status (scoped to current page's invoices)
    const invoiceIdNums = sales.map(s => s.id);
    const paymentOrders = await prisma.paymentOrder.findMany({
      select: { invoiceIds: true, status: true },
      take: 2000,
    });

    function getPaymentStatus(invoiceId, invoiceMasterStatus) {
      if (invoiceMasterStatus === '已退貨' || invoiceMasterStatus === '部分退貨') return invoiceMasterStatus;
      const idNum = Number(invoiceId);
      const related = paymentOrders.filter(o =>
        Array.isArray(o.invoiceIds) && o.invoiceIds.some(id => Number(id) === idNum || id === invoiceId)
      );
      if (related.length === 0) return '未付款';
      if (related.some(o => o.status === '已退貨'))   return '已退貨';
      if (related.some(o => o.status === '部分退貨')) return '部分退貨';
      if (related.some(o => o.status === '已執行'))   return '已付款';
      if (related.some(o => o.status === '待出納'))   return '待出納';
      if (related.some(o => o.status === '草稿'))     return '草稿';
      return '未付款';
    }

    const data = sales.map(invoice => {
      const firstPurchaseId = invoice.details[0]?.purchaseId;
      const purchase = firstPurchaseId ? purchaseMap.get(firstPurchaseId) : null;
      return {
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
        paymentStatus: getPaymentStatus(invoice.id, invoice.status),
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
          subtotal: d.subtotal ? Number(d.subtotal) : null,
        })),
        createdAt: invoice.createdAt.toISOString(),
        updatedAt: invoice.updatedAt.toISOString(),
        supplierName: purchase?.supplier?.name || '未知廠商',
        supplierId:   purchase?.supplierId || null,
        warehouse:    invoice.details[0]?.warehouse || purchase?.warehouse || '',
      };
    });

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

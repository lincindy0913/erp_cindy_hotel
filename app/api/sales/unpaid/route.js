import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.SALES_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth');
    const supplierId = searchParams.get('supplierId');
    const warehouse = searchParams.get('warehouse');
    const paymentTerms = searchParams.get('paymentTerms');
    const purchaseId = searchParams.get('purchaseId') ? parseInt(searchParams.get('purchaseId')) : null;
    const page  = Math.max(parseInt(searchParams.get('page')  || '1'), 1);
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);

    // 只呈現「未付款」：排除已在任一付款單（草稿/待出納/已執行）的發票
    const paymentOrders = await prisma.paymentOrder.findMany({
      where: { status: { in: ['草稿', '待出納', '已執行'] } },
      select: { invoiceIds: true }
    });
    const inPaymentOrPaidIds = new Set();
    paymentOrders.forEach(order => {
      const ids = order.invoiceIds;
      if (Array.isArray(ids)) {
        ids.forEach(id => inPaymentOrPaidIds.add(Number(id)));
      }
    });

    // 在 DB 層推入日期和 purchaseId 篩選，避免全量載入
    const salesWhere = {};
    if (yearMonth) {
      salesWhere.invoiceDate = { gte: `${yearMonth}-01`, lte: `${yearMonth}-31` };
    }
    if (purchaseId) {
      salesWhere.details = { some: { purchaseId } };
    }

    const sales = await prisma.salesMaster.findMany({
      where: salesWhere,
      include: { details: true },
      orderBy: { id: 'asc' }
    });

    // 收集所有需要的 purchaseMaster ID，單次批次查詢取代 N+1
    const allPurchaseIds = new Set();
    for (const invoice of sales) {
      if (invoice.details.length > 0 && invoice.details[0].purchaseId) {
        allPurchaseIds.add(invoice.details[0].purchaseId);
      }
    }
    const purchaseMasters = allPurchaseIds.size > 0
      ? await prisma.purchaseMaster.findMany({
          where: { id: { in: [...allPurchaseIds] } },
          include: { supplier: { select: { name: true } } },
        })
      : [];
    const purchaseMap = new Map(purchaseMasters.map(p => [p.id, p]));

    const unpaidInvoices = [];

    for (const invoice of sales) {
      if (inPaymentOrPaidIds.has(invoice.id)) continue;

      let invoiceSupplierId = null;
      let invoiceSupplierName = '未知廠商';
      let invoiceWarehouse = '';
      let invoicePaymentTerms = '';

      if (invoice.details.length > 0 && invoice.details[0].purchaseId) {
        const purchase = purchaseMap.get(invoice.details[0].purchaseId);
        if (purchase) {
          invoiceSupplierId = purchase.supplierId;
          invoiceSupplierName = purchase.supplier?.name || '未知廠商';
          invoiceWarehouse = purchase.warehouse || '';
          invoicePaymentTerms = purchase.paymentTerms || '';
        }
      }

      // supplierId / warehouse / paymentTerms 無法在 DB 層篩選（欄位在 purchaseMaster 非 salesMaster）
      if (supplierId && (!invoiceSupplierId || invoiceSupplierId !== parseInt(supplierId))) continue;
      if (warehouse && invoiceWarehouse !== warehouse) continue;
      if (paymentTerms && invoicePaymentTerms !== paymentTerms) continue;

      unpaidInvoices.push({
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
        createdAt: invoice.createdAt.toISOString(),
        updatedAt: invoice.updatedAt.toISOString(),
        supplierId: invoiceSupplierId,
        supplierName: invoiceSupplierName,
        warehouse: invoiceWarehouse,
        paymentTerms: invoicePaymentTerms
      });
    }

    const totalCount = unpaidInvoices.length;
    const pagedData  = unpaidInvoices.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      data: pagedData,
      pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
    });
  } catch (error) {
    console.error('查詢未付款發票錯誤:', error.message || error);
    return handleApiError(error);
  }
}

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
    const sales = await prisma.salesMaster.findMany({
      include: { details: true },
      orderBy: { id: 'asc' }
    });

    // 依付款單狀態計算每張發票的「付款狀態」（與 /api/sales 一致）
    const paymentOrders = await prisma.paymentOrder.findMany({
      where: { status: { in: ['草稿', '待出納', '已執行'] } },
      select: { invoiceIds: true, status: true }
    });

    function getPaymentStatusForInvoice(invoiceId) {
      const idNum = Number(invoiceId);
      const related = paymentOrders.filter(o => {
        if (!Array.isArray(o.invoiceIds)) return false;
        return o.invoiceIds.some(id => Number(id) === idNum || id === invoiceId);
      });
      if (related.length === 0) return '未付款';
      if (related.some(o => o.status === '已執行')) return '已付款';
      if (related.some(o => o.status === '待出納')) return '待出納';
      if (related.some(o => o.status === '草稿')) return '草稿';
      return '未付款';
    }

    const invoicesWithInfo = await Promise.all(sales.map(async (invoice) => {
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
        paymentStatus: getPaymentStatusForInvoice(invoice.id),
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
        supplierName,
        supplierId,
        warehouse
      };
    }));

    return NextResponse.json(invoicesWithInfo);
  } catch (error) {
    console.error('查詢發票列表錯誤:', error.message || error);
    return handleApiError(error);
  }
}

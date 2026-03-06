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
    console.error('查詢發票列表錯誤:', error);
    return handleApiError(error);
  }
}

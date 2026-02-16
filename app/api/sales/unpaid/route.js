import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth');
    const supplierId = searchParams.get('supplierId');
    const warehouse = searchParams.get('warehouse');
    const paymentTerms = searchParams.get('paymentTerms');

    // 取得所有已付款的發票ID
    const allPayments = await prisma.payment.findMany({
      select: { invoiceIds: true }
    });
    const paidInvoiceIds = new Set();
    allPayments.forEach(payment => {
      const ids = payment.invoiceIds;
      if (Array.isArray(ids)) {
        ids.forEach(id => paidInvoiceIds.add(id));
      }
    });

    // 取得所有發票及明細
    const sales = await prisma.salesMaster.findMany({
      include: { details: true },
      orderBy: { id: 'asc' }
    });

    const unpaidInvoices = [];

    for (const invoice of sales) {
      // 排除已付款
      if (paidInvoiceIds.has(invoice.id)) continue;

      // 從明細取得廠商和館別資訊
      let invoiceSupplierId = null;
      let invoiceSupplierName = '未知廠商';
      let invoiceWarehouse = '';
      let invoicePaymentTerms = '';

      if (invoice.details.length > 0 && invoice.details[0].purchaseId) {
        const purchase = await prisma.purchaseMaster.findUnique({
          where: { id: invoice.details[0].purchaseId },
          include: { supplier: { select: { name: true } } }
        });
        if (purchase) {
          invoiceSupplierId = purchase.supplierId;
          invoiceSupplierName = purchase.supplier?.name || '未知廠商';
          invoiceWarehouse = purchase.warehouse || '';
          invoicePaymentTerms = purchase.paymentTerms || '';
        }
      }

      // 篩選條件
      if (yearMonth) {
        const invoiceYearMonth = invoice.invoiceDate ? invoice.invoiceDate.substring(0, 7) : '';
        if (invoiceYearMonth !== yearMonth) continue;
      }
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

    return NextResponse.json(unpaidInvoices);
  } catch (error) {
    console.error('查詢未付款發票錯誤:', error);
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 搜尋已付款的發票（供折讓選擇用）
// 流程：發票(SalesMaster) → PaymentOrder(已執行) → 可折讓
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword') || '';

    if (!keyword || keyword.length < 1) {
      return NextResponse.json([]);
    }

    // 1. Search PaymentOrders that are '已執行' and sourceType is purchasing-related
    const paymentOrders = await prisma.paymentOrder.findMany({
      where: {
        status: '已執行',
        sourceType: { in: ['payment_order', 'purchasing'] },
        OR: [
          { orderNo: { contains: keyword, mode: 'insensitive' } },
          { supplierName: { contains: keyword, mode: 'insensitive' } },
          { summary: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      include: { executions: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    // 2. Get linked invoices from invoiceIds
    const results = [];

    for (const po of paymentOrders) {
      let invoiceIds = [];
      try {
        invoiceIds = typeof po.invoiceIds === 'string' ? JSON.parse(po.invoiceIds) : (po.invoiceIds || []);
      } catch { invoiceIds = []; }

      const intIds = invoiceIds.map(id => parseInt(id)).filter(Boolean);

      let invoices = [];
      if (intIds.length > 0) {
        invoices = await prisma.salesMaster.findMany({
          where: { id: { in: intIds } },
          include: { details: { include: { product: true } } },
        });
      }

      // Get execution info (actual payment)
      const execution = po.executions?.[0];

      for (const inv of invoices) {
        results.push({
          invoiceId: inv.id,
          invoiceNo: inv.invoiceNo,
          invoiceDate: inv.invoiceDate,
          invoiceTitle: inv.invoiceTitle,
          invoiceAmount: Number(inv.totalAmount),
          amount: Number(inv.amount),
          tax: Number(inv.tax),
          totalAmount: Number(inv.totalAmount),
          paymentOrderId: po.id,
          paymentOrderNo: po.orderNo,
          supplierId: po.supplierId,
          supplierName: po.supplierName || '',
          warehouse: po.warehouse || '',
          paymentMethod: po.paymentMethod,
          paidDate: execution?.executionDate || '',
          paidAmount: execution ? Number(execution.actualAmount) : Number(po.netAmount),
          details: inv.details.map(d => ({
            productName: d.product?.name || d.purchaseItemId || '',
            quantity: Number(d.quantity),
            unitPrice: Number(d.unitPrice),
            subtotal: Number(d.subtotal || 0),
            purchaseNo: d.purchaseNo || '',
            purchaseId: d.purchaseId,
            warehouse: d.warehouse || '',
          })),
        });
      }

      // If no invoice found, still show the PO info
      if (invoices.length === 0) {
        results.push({
          invoiceId: null,
          invoiceNo: '',
          invoiceDate: '',
          invoiceTitle: '',
          invoiceAmount: Number(po.amount),
          amount: Number(po.amount),
          tax: 0,
          totalAmount: Number(po.netAmount),
          paymentOrderId: po.id,
          paymentOrderNo: po.orderNo,
          supplierId: po.supplierId,
          supplierName: po.supplierName || '',
          warehouse: po.warehouse || '',
          paymentMethod: po.paymentMethod,
          paidDate: execution?.executionDate || '',
          paidAmount: execution ? Number(execution.actualAmount) : Number(po.netAmount),
          details: [],
        });
      }
    }

    // Also search directly by invoice number
    if (results.length < 5) {
      const directInvoices = await prisma.salesMaster.findMany({
        where: {
          OR: [
            { invoiceNo: { contains: keyword, mode: 'insensitive' } },
            { invoiceTitle: { contains: keyword, mode: 'insensitive' } },
          ],
        },
        include: { details: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      for (const inv of directInvoices) {
        // Skip if already in results
        if (results.some(r => r.invoiceId === inv.id)) continue;

        // Find related paid PaymentOrder
        const relatedPO = await prisma.paymentOrder.findFirst({
          where: {
            status: '已執行',
            invoiceIds: { not: '[]' },
          },
          include: { executions: true },
          orderBy: { createdAt: 'desc' },
        });

        // Check if this invoice is in a paid PO
        let matchedPO = null;
        if (relatedPO) {
          let ids = [];
          try { ids = typeof relatedPO.invoiceIds === 'string' ? JSON.parse(relatedPO.invoiceIds) : (relatedPO.invoiceIds || []); } catch { ids = []; }
          if (ids.map(Number).includes(inv.id)) {
            matchedPO = relatedPO;
          }
        }

        results.push({
          invoiceId: inv.id,
          invoiceNo: inv.invoiceNo,
          invoiceDate: inv.invoiceDate,
          invoiceTitle: inv.invoiceTitle,
          invoiceAmount: Number(inv.totalAmount),
          amount: Number(inv.amount),
          tax: Number(inv.tax),
          totalAmount: Number(inv.totalAmount),
          paymentOrderId: matchedPO?.id || null,
          paymentOrderNo: matchedPO?.orderNo || '',
          supplierId: matchedPO?.supplierId || null,
          supplierName: matchedPO?.supplierName || inv.invoiceTitle || '',
          warehouse: matchedPO?.warehouse || inv.details?.[0]?.warehouse || '',
          paymentMethod: matchedPO?.paymentMethod || '',
          paidDate: matchedPO?.executions?.[0]?.executionDate || '',
          paidAmount: matchedPO ? Number(matchedPO.executions?.[0]?.actualAmount || matchedPO.netAmount) : 0,
          details: inv.details.map(d => ({
            productName: d.product?.name || d.purchaseItemId || '',
            quantity: Number(d.quantity),
            unitPrice: Number(d.unitPrice),
            subtotal: Number(d.subtotal || 0),
            purchaseNo: d.purchaseNo || '',
            purchaseId: d.purchaseId,
            warehouse: d.warehouse || '',
          })),
        });
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/purchase-allowances/search-invoices error:', error.message || error);
    return handleApiError(error);
  }
}

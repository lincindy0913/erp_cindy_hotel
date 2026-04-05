import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 搜尋進貨單（供折讓選擇用），並連動找出對應的發票單號與付款單號
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword') || '';

    if (!keyword || keyword.length < 1) {
      return NextResponse.json([]);
    }

    // 1. 搜尋進貨單（by purchaseNo 或 supplier name）
    const purchases = await prisma.purchaseMaster.findMany({
      where: {
        OR: [
          { purchaseNo: { contains: keyword, mode: 'insensitive' } },
          { supplier: { name: { contains: keyword, mode: 'insensitive' } } },
          { warehouse: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      include: {
        supplier: { select: { id: true, name: true } },
        details: {
          include: { product: { select: { id: true, name: true, unit: true } } },
        },
      },
      orderBy: { id: 'desc' },
      take: 30,
    });

    if (purchases.length === 0) return NextResponse.json([]);

    // 2. 找每筆進貨單對應的發票（透過 SalesDetail.purchaseId → SalesMaster）
    const purchaseIds = purchases.map(p => p.id);
    const salesDetails = await prisma.salesDetail.findMany({
      where: { purchaseId: { in: purchaseIds } },
      select: { salesId: true, purchaseId: true },
      distinct: ['salesId', 'purchaseId'],
    });

    // purchaseId → salesId[]
    const purchaseToSalesIds = {};
    for (const sd of salesDetails) {
      if (!purchaseToSalesIds[sd.purchaseId]) purchaseToSalesIds[sd.purchaseId] = [];
      if (!purchaseToSalesIds[sd.purchaseId].includes(sd.salesId)) {
        purchaseToSalesIds[sd.purchaseId].push(sd.salesId);
      }
    }

    // 3. 取得所有相關 SalesMaster
    const allSalesIds = [...new Set(salesDetails.map(sd => sd.salesId))];
    const salesMasters = allSalesIds.length > 0
      ? await prisma.salesMaster.findMany({
          where: { id: { in: allSalesIds } },
          select: { id: true, invoiceNo: true, invoiceDate: true, amount: true, tax: true, totalAmount: true },
        })
      : [];
    const salesById = {};
    for (const sm of salesMasters) salesById[sm.id] = sm;

    // 4. 找付款單（PaymentOrder.invoiceIds 包含 salesMaster.id，且已執行）
    const allPaymentOrders = allSalesIds.length > 0
      ? await prisma.paymentOrder.findMany({
          where: { status: '已執行' },
          select: { id: true, orderNo: true, supplierId: true, supplierName: true, warehouse: true, invoiceIds: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        })
      : [];

    // salesId → PaymentOrder
    const salesIdToPaymentOrder = {};
    for (const po of allPaymentOrders) {
      let ids = [];
      try { ids = typeof po.invoiceIds === 'string' ? JSON.parse(po.invoiceIds) : (po.invoiceIds || []); } catch { ids = []; }
      for (const sid of ids.map(Number)) {
        if (allSalesIds.includes(sid) && !salesIdToPaymentOrder[sid]) {
          salesIdToPaymentOrder[sid] = po;
        }
      }
    }

    // 5. 組裝結果
    const results = purchases.map(p => {
      const salesIds = purchaseToSalesIds[p.id] || [];
      // 取第一筆發票
      const firstSalesId = salesIds[0] || null;
      const invoice = firstSalesId ? salesById[firstSalesId] : null;
      const paymentOrder = firstSalesId ? salesIdToPaymentOrder[firstSalesId] : null;

      return {
        purchaseId: p.id,
        purchaseNo: p.purchaseNo,
        purchaseDate: p.purchaseDate,
        supplierId: p.supplierId,
        supplierName: p.supplier?.name || '',
        warehouse: p.warehouse || '',
        amount: Number(p.amount),
        tax: Number(p.tax),
        totalAmount: Number(p.totalAmount),
        status: p.status,
        // 連動發票
        invoiceId: invoice?.id || null,
        invoiceNo: invoice?.invoiceNo || '',
        invoiceDate: invoice?.invoiceDate || '',
        invoiceAmount: invoice ? Number(invoice.totalAmount) : null,
        // 連動付款單
        paymentOrderId: paymentOrder?.id || null,
        paymentOrderNo: paymentOrder?.orderNo || '',
        // 明細
        details: p.details.map(d => ({
          productId: d.productId,
          productName: d.product?.name || '',
          unit: d.product?.unit || '',
          quantity: d.quantity,
          unitPrice: Number(d.unitPrice),
          subtotal: Number(d.unitPrice) * d.quantity,
        })),
      };
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET /api/purchase-allowances/search-purchases error:', error.message || error);
    return handleApiError(error);
  }
}

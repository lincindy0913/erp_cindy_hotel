import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

/**
 * 取得傳票完整資料
 * 包含：發票資料、進貨單資料、產品歷史最低價
 */
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const invoiceId = parseInt(params.invoiceId);

    // 取得發票資料（含明細）
    const invoice = await prisma.salesMaster.findUnique({
      where: { id: invoiceId },
      include: { details: true }
    });

    if (!invoice) {
      return createErrorResponse('NOT_FOUND', '發票不存在', 404);
    }

    // 批次取得所有需要的資料，避免 N+1
    const detailsWithPurchase = invoice.details.filter(d => d.purchaseId);
    const uniquePurchaseIds = [...new Set(detailsWithPurchase.map(d => d.purchaseId))];
    const uniqueProductIds  = [...new Set(invoice.details.map(d => d.productId).filter(Boolean))];

    const [purchases, products, priceHistories] = await Promise.all([
      uniquePurchaseIds.length > 0
        ? prisma.purchaseMaster.findMany({
            where: { id: { in: uniquePurchaseIds } },
            include: { supplier: { select: { id: true, name: true } } },
          })
        : [],
      uniqueProductIds.length > 0
        ? prisma.product.findMany({
            where: { id: { in: uniqueProductIds } },
            select: { id: true, name: true, code: true },
          })
        : [],
      uniqueProductIds.length > 0
        ? prisma.priceHistory.findMany({
            where: { productId: { in: uniqueProductIds } },
            select: { productId: true, unitPrice: true },
          })
        : [],
    ]);

    const purchaseMap     = new Map(purchases.map(p => [p.id, p]));
    const productMap      = new Map(products.map(p => [p.id, p]));
    const priceHistoryMap = new Map();
    for (const ph of priceHistories) {
      if (!priceHistoryMap.has(ph.productId)) priceHistoryMap.set(ph.productId, []);
      priceHistoryMap.get(ph.productId).push(Number(ph.unitPrice));
    }

    const itemsWithPurchaseInfo = [];
    for (const item of invoice.details) {
      const purchase = item.purchaseId ? purchaseMap.get(item.purchaseId) : null;
      if (!purchase) continue;

      const product = item.productId ? productMap.get(item.productId) : null;
      const currentPrice = Number(item.unitPrice || 0);

      // 計算歷史最低價
      let minHistoricalPrice = null;
      const history = item.productId ? (priceHistoryMap.get(item.productId) || []) : [];
      if (history.length > 0) {
        const others = history.filter(p => p !== currentPrice);
        if (others.length > 0) minHistoricalPrice = Math.min(...others);
        else if (history.length > 1) minHistoricalPrice = Math.min(...history);
      }

      const isPriceHigher = minHistoricalPrice !== null && currentPrice > minHistoricalPrice;

      itemsWithPurchaseInfo.push({
        id: item.id,
        productId: item.productId,
        productName: product?.name || item.productName || '未知產品',
        productCode: product?.code || '-',
        quantity: item.quantity,
        unitPrice: currentPrice,
        subtotal: Number(item.subtotal || 0),
        note: item.note || '',
        purchaseId: item.purchaseId,
        purchaseNo: purchase.purchaseNo,
        purchaseDate: purchase.purchaseDate,
        purchaseItemId: item.purchaseItemId,
        warehouse: purchase.warehouse || item.warehouse || '',
        department: purchase.department || '',
        supplierId: purchase.supplierId,
        supplierName: purchase.supplier?.name || '未知廠商',
        currentPrice,
        minHistoricalPrice,
        isPriceHigher,
        priceDifference: isPriceHigher ? (currentPrice - minHistoricalPrice) : 0,
      });
    }

    // 取得廠商和館別
    let supplierName = '';
    let warehouse = '';

    if (itemsWithPurchaseInfo.length > 0) {
      supplierName = itemsWithPurchaseInfo[0].supplierName;
      warehouse = itemsWithPurchaseInfo[0].warehouse;
    }

    const voucherData = {
      // 基本資料
      supplierName,
      warehouse,
      // 發票資料
      invoice: {
        id: invoice.id,
        invoiceNo: invoice.invoiceNo || invoice.salesNo,
        invoiceDate: invoice.invoiceDate || invoice.salesDate,
        amount: Number(invoice.invoiceAmount || invoice.totalAmount || 0),
        tax: Number(invoice.tax || 0),
        totalAmount: Number(invoice.totalAmount || 0),
        status: invoice.status || '待核銷'
      },
      // 品項資料（包含進貨單資訊和價格比對）
      items: itemsWithPurchaseInfo
    };

    return NextResponse.json(voucherData);
  } catch (error) {
    return handleApiError(error);
  }
}

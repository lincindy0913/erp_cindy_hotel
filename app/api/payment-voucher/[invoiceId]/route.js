import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

/**
 * 取得傳票完整資料
 * 包含：發票資料、進貨單資料、產品歷史最低價
 */
export async function GET(request, { params }) {
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

    // 從發票的 details 中取得進貨單資訊
    const purchaseIds = new Set();
    const itemsWithPurchaseInfo = [];

    for (const item of invoice.details) {
      if (item.purchaseId) {
        purchaseIds.add(item.purchaseId);
      }

      // 取得進貨單資訊
      let purchase = null;
      if (item.purchaseId) {
        purchase = await prisma.purchaseMaster.findUnique({
          where: { id: item.purchaseId },
          include: { supplier: { select: { id: true, name: true } } }
        });
      }

      if (purchase) {
        const product = item.productId
          ? await prisma.product.findUnique({ where: { id: item.productId }, select: { name: true, code: true } })
          : null;

        // 取得該產品的所有歷史價格記錄
        const allProductPriceHistory = item.productId
          ? await prisma.priceHistory.findMany({ where: { productId: item.productId } })
          : [];

        // 當前價格 = 發票中的單價（也就是進貨時的價格）
        const currentPrice = Number(item.unitPrice || 0);

        // 計算歷史最低價
        let minHistoricalPrice = null;
        if (allProductPriceHistory.length > 0) {
          const historicalPrices = allProductPriceHistory
            .map(ph => Number(ph.unitPrice))
            .filter(price => price !== currentPrice);

          if (historicalPrices.length > 0) {
            minHistoricalPrice = Math.min(...historicalPrices);
          } else if (allProductPriceHistory.length > 1) {
            minHistoricalPrice = Math.min(...allProductPriceHistory.map(ph => Number(ph.unitPrice)));
          }
        }

        // 判斷是否異常：當前價格 > 歷史最低價
        const isPriceHigher = minHistoricalPrice !== null && currentPrice > minHistoricalPrice;

        itemsWithPurchaseInfo.push({
          id: item.id,
          productId: item.productId,
          productName: product?.name || item.productName || '未知產品',
          productCode: product?.code || '-',
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice || 0),
          subtotal: Number(item.subtotal || 0),
          note: item.note || '',
          // 進貨單資訊
          purchaseId: item.purchaseId,
          purchaseNo: purchase.purchaseNo,
          purchaseDate: purchase.purchaseDate,
          purchaseItemId: item.purchaseItemId,
          warehouse: purchase.warehouse || item.warehouse || '',
          department: purchase.department || '',
          supplierId: purchase.supplierId,
          supplierName: purchase.supplier?.name || '未知廠商',
          // 價格比對
          currentPrice,
          minHistoricalPrice,
          isPriceHigher,
          priceDifference: isPriceHigher ? (currentPrice - minHistoricalPrice) : 0
        });
      }
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

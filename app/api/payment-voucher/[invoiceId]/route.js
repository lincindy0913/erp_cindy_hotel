import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

/**
 * 取得傳票完整資料
 * 包含：發票資料、進貨單資料、產品歷史最低價
 */
export async function GET(request, { params }) {
  try {
    const store = getStore();
    const invoiceId = parseInt(params.invoiceId);

    // 取得發票資料
    const invoice = store.sales.find(s => s.id === invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: '發票不存在' }, { status: 404 });
    }

    // 從發票的 items 中取得進貨單資訊
    const purchaseIds = new Set();
    const itemsWithPurchaseInfo = [];

    if (invoice.items && Array.isArray(invoice.items)) {
      invoice.items.forEach(item => {
        if (item.purchaseId) {
          purchaseIds.add(item.purchaseId);
        }

        // 取得進貨單資訊
        const purchase = store.purchases.find(p => p.id === item.purchaseId);
        if (purchase) {
          const supplier = store.suppliers.find(s => s.id === purchase.supplierId);
          const product = store.products.find(p => p.id === item.productId);
          
          // 取得該產品的歷史最低價（從價格歷史記錄中）
          const productPriceHistory = store.priceHistory.filter(
            ph => ph.productId === item.productId
          );
          
          let minHistoricalPrice = null;
          if (productPriceHistory.length > 0) {
            minHistoricalPrice = Math.min(...productPriceHistory.map(ph => parseFloat(ph.unitPrice)));
          }

          // 當前價格 = 發票中的單價（也就是進貨時的價格）
          const currentPrice = parseFloat(item.unitPrice || 0);
          
          // 判斷是否異常：當前價格 > 歷史最低價
          const isPriceHigher = minHistoricalPrice !== null && currentPrice > minHistoricalPrice;

          itemsWithPurchaseInfo.push({
            ...item,
            // 進貨單資訊
            purchaseNo: purchase.purchaseNo,
            purchaseDate: purchase.purchaseDate,
            warehouse: purchase.warehouse,
            department: purchase.department,
            supplierId: purchase.supplierId,
            supplierName: supplier ? supplier.name : '未知廠商',
            // 產品資訊
            productName: product ? product.name : '未知產品',
            productCode: product ? product.code : '-',
            // 價格比對
            currentPrice: currentPrice,
            minHistoricalPrice: minHistoricalPrice,
            isPriceHigher: isPriceHigher,
            priceDifference: isPriceHigher ? (currentPrice - minHistoricalPrice) : 0
          });
        }
      });
    }

    // 取得第一個進貨單來取得廠商和管別（如果有多個進貨單，使用第一個作為主要資訊）
    const firstPurchaseId = Array.from(purchaseIds)[0];
    const firstPurchase = store.purchases.find(p => p.id === firstPurchaseId);
    let supplierName = '';
    let warehouse = '';
    
    if (firstPurchase) {
      const supplier = store.suppliers.find(s => s.id === firstPurchase.supplierId);
      supplierName = supplier ? supplier.name : '未知廠商';
      warehouse = firstPurchase.warehouse || '';
    }

    // 從 itemsWithPurchaseInfo 中取得廠商和管別（優先使用）
    if (itemsWithPurchaseInfo.length > 0) {
      supplierName = itemsWithPurchaseInfo[0].supplierName;
      warehouse = itemsWithPurchaseInfo[0].warehouse;
    }

    const voucherData = {
      // 基本資料
      supplierName: supplierName,
      warehouse: warehouse,
      // 發票資料
      invoice: {
        id: invoice.id,
        invoiceNo: invoice.invoiceNo || invoice.salesNo,
        invoiceDate: invoice.invoiceDate || invoice.salesDate,
        amount: parseFloat(invoice.amount || 0),
        tax: parseFloat(invoice.tax || 0),
        totalAmount: parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0)),
        status: invoice.status || '待核銷'
      },
      // 品項資料（包含進貨單資訊和價格比對）
      items: itemsWithPurchaseInfo
    };

    return NextResponse.json(voucherData);
  } catch (error) {
    console.error('取得傳票資料錯誤:', error);
    return NextResponse.json({ error: '取得傳票資料失敗' }, { status: 500 });
  }
}


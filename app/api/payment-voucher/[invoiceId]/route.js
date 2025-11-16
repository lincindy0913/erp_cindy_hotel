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
          
          // 取得該產品的所有歷史價格記錄
          const allProductPriceHistory = store.priceHistory.filter(
            ph => ph.productId === item.productId
          );
          
          // 當前價格 = 發票中的單價（也就是進貨時的價格）
          const currentPrice = parseFloat(item.unitPrice || 0);
          
          // 計算歷史最低價（排除當前這筆進貨的價格）
          // 方法：找出所有不等於當前價格的歷史記錄中的最低價
          // 如果所有歷史記錄的價格都等於當前價格，則無法比較
          let minHistoricalPrice = null;
          if (allProductPriceHistory.length > 0) {
            // 取得所有不等於當前價格的歷史價格
            const historicalPrices = allProductPriceHistory
              .map(ph => parseFloat(ph.unitPrice))
              .filter(price => price !== currentPrice);
            
            if (historicalPrices.length > 0) {
              // 有歷史價格（不等於當前價格），使用歷史最低價
              minHistoricalPrice = Math.min(...historicalPrices);
            } else if (allProductPriceHistory.length > 1) {
              // 所有歷史價格都等於當前價格，但有多筆記錄，使用所有記錄中的最低價
              minHistoricalPrice = Math.min(...allProductPriceHistory.map(ph => parseFloat(ph.unitPrice)));
            }
            // 如果只有一筆記錄，minHistoricalPrice 保持為 null
          }
          
          // 判斷是否異常：當前價格 > 歷史最低價（需要有歷史價格才能比較）
          const isPriceHigher = minHistoricalPrice !== null && currentPrice > minHistoricalPrice;
          
          // 調試信息
          console.log(`[付款傳票] 產品ID: ${item.productId}, 產品名稱: ${product?.name || '未知'}`);
          console.log(`[付款傳票] 當前價格: ${currentPrice}, 歷史最低價: ${minHistoricalPrice}, 是否異常: ${isPriceHigher}`);
          console.log(`[付款傳票] 價格歷史記錄數量: ${allProductPriceHistory.length}`);
          console.log(`[付款傳票] 價格歷史記錄:`, allProductPriceHistory.map(ph => ({ date: ph.purchaseDate, price: ph.unitPrice })));

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


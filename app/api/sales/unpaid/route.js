import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

/**
 * 取得未付款的發票
 * 查詢參數：
 * - yearMonth: 銷帳年月 (發票日期) (YYYY-MM)
 * - supplierId: 廠商ID
 * - warehouse: 管別（館別）
 */
export async function GET(request) {
  try {
    const store = getStore();
    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth'); // YYYY-MM
    const supplierId = searchParams.get('supplierId');
    const warehouse = searchParams.get('warehouse');

    // 取得所有已付款的發票ID集合
    // 注意：payments 中可能有 salesId 欄位指向發票
    const paidInvoiceIds = new Set();
    store.payments.forEach(payment => {
      if (payment.invoiceIds && Array.isArray(payment.invoiceIds)) {
        payment.invoiceIds.forEach(invoiceId => {
          paidInvoiceIds.add(invoiceId);
        });
      }
      // 兼容舊格式：如果 payment 有 salesId 欄位
      if (payment.salesId) {
        paidInvoiceIds.add(payment.salesId);
      }
    });

    // 從進貨單建立發票與廠商、館別的映射
    // 發票的 items 中包含 purchaseId，可以從中取得 supplier 和 warehouse
    const invoiceSupplierMap = new Map(); // invoiceId -> supplierId
    const invoiceWarehouseMap = new Map(); // invoiceId -> warehouse (使用第一個找到的)
    const invoicePurchaseMap = new Map(); // invoiceId -> purchase info

    store.sales.forEach(invoice => {
      if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
        // 從第一個 item 的 purchaseId 取得進貨單資訊
        const firstPurchaseId = invoice.items[0].purchaseId;
        const purchase = store.purchases.find(p => p.id === firstPurchaseId);
        
        if (purchase) {
          invoiceSupplierMap.set(invoice.id, purchase.supplierId);
          invoiceWarehouseMap.set(invoice.id, purchase.warehouse || '');
          invoicePurchaseMap.set(invoice.id, {
            supplierId: purchase.supplierId,
            warehouse: purchase.warehouse || '',
            supplierName: store.suppliers.find(s => s.id === purchase.supplierId)?.name || '未知廠商'
          });
        }
      }
    });

    // 篩選未付款的發票
    const unpaidInvoices = store.sales
      .filter(invoice => {
        // 排除已付款的發票
        if (paidInvoiceIds.has(invoice.id)) {
          return false;
        }

        // 篩選條件：銷帳年月（發票日期）
        if (yearMonth) {
          const invoiceYearMonth = invoice.invoiceDate ? invoice.invoiceDate.substring(0, 7) : '';
          if (invoiceYearMonth !== yearMonth) {
            return false;
          }
        }

        // 篩選條件：廠商
        if (supplierId) {
          const invoiceSupplierId = invoiceSupplierMap.get(invoice.id);
          if (!invoiceSupplierId || invoiceSupplierId !== parseInt(supplierId)) {
            return false;
          }
        }

        // 篩選條件：管別（館別）
        if (warehouse) {
          const invoiceWarehouse = invoiceWarehouseMap.get(invoice.id);
          if (!invoiceWarehouse || invoiceWarehouse !== warehouse) {
            return false;
          }
        }

        return true;
      })
      .map(invoice => {
        const purchaseInfo = invoicePurchaseMap.get(invoice.id) || {};
        return {
          ...invoice,
          supplierId: purchaseInfo.supplierId,
          supplierName: purchaseInfo.supplierName,
          warehouse: purchaseInfo.warehouse
        };
      });

    return NextResponse.json(unpaidInvoices);
  } catch (error) {
    console.error('查詢未付款發票錯誤:', error);
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 });
  }
}


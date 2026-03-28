import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { renderVoucherTablePage } from '@/lib/voucher-pdf-renderer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/export/payment-voucher/batch
 * Batch PDF: multiple payment vouchers in one PDF (one per page)
 * Body: { ids: [1, 2, 3, ...] }
 */
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.EXPORT_PDF, PERMISSIONS.FINANCE_VIEW, PERMISSIONS.PURCHASING_VIEW]);
  if (!auth.ok) return auth.response;
  if (!auth.session.user.permissions?.includes('*')) {
    const perms = auth.session.user.permissions || [];
    if (!perms.includes(PERMISSIONS.EXPORT_PDF)) {
      return createErrorResponse('FORBIDDEN', '需要匯出 PDF 權限', 403);
    }
  }

  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.map(id => parseInt(id)).filter(id => !isNaN(id)) : [];

    if (ids.length === 0) return createErrorResponse('VALIDATION_FAILED', '請至少選擇一張傳票', 400);
    if (ids.length > 50) return createErrorResponse('VALIDATION_FAILED', '一次最多列印 50 張傳票', 400);

    // Fetch all orders
    const orders = await prisma.paymentOrder.findMany({
      where: { id: { in: ids } },
      include: { executions: true },
      orderBy: { createdAt: 'desc' },
    });
    if (orders.length === 0) return createErrorResponse('NOT_FOUND', '找不到付款單', 404);

    // Batch fetch invoices
    const allInvoiceIds = [];
    for (const order of orders) {
      const invIds = Array.isArray(order.invoiceIds) ? order.invoiceIds.map(id => parseInt(id)) : [];
      allInvoiceIds.push(...invIds);
    }
    const allInvoices = allInvoiceIds.length > 0
      ? await prisma.salesMaster.findMany({ where: { id: { in: [...new Set(allInvoiceIds)] } }, include: { details: true } })
      : [];
    const invoiceMap = new Map(allInvoices.map(inv => [inv.id, inv]));

    // Batch fetch cash transactions
    const cashTxIds = orders.flatMap(o => o.executions?.map(e => e.cashTransactionId).filter(Boolean) || []);
    const cashTxs = cashTxIds.length > 0
      ? await prisma.cashTransaction.findMany({ where: { id: { in: [...new Set(cashTxIds)] } } })
      : [];
    const cashTxMap = new Map(cashTxs.map(tx => [tx.id, tx]));

    // Batch fetch account names
    const accountIds = [...new Set(orders.map(o => o.accountId).filter(Boolean))];
    const accounts = accountIds.length > 0
      ? await prisma.cashAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true } })
      : [];
    const accountMap = new Map(accounts.map(a => [a.id, a.name]));

    const makerName = auth.session?.user?.name || auth.session?.user?.email?.split('@')[0] || '';

    // ── Batch fetch related purchases via SalesDetail.purchaseId ──
    const allSalesDetailPurchaseIds = [];
    for (const inv of allInvoices) {
      if (inv.details) {
        for (const d of inv.details) {
          if (d.purchaseId) allSalesDetailPurchaseIds.push(d.purchaseId);
        }
      }
    }
    const uniquePurchaseIds = [...new Set(allSalesDetailPurchaseIds)];
    const allPurchases = uniquePurchaseIds.length > 0
      ? await prisma.purchaseMaster.findMany({
          where: { id: { in: uniquePurchaseIds } },
          include: { details: { include: { product: { select: { id: true, name: true, unit: true } } } } },
          orderBy: { purchaseDate: 'asc' },
        })
      : [];
    const purchaseMap = new Map(allPurchases.map(p => [p.id, p]));

    // Build a map: invoiceId → [purchaseId] for linking
    const invoiceToPurchaseIds = new Map();
    for (const inv of allInvoices) {
      const pIds = new Set();
      if (inv.details) {
        for (const d of inv.details) {
          if (d.purchaseId) pIds.add(d.purchaseId);
        }
      }
      invoiceToPurchaseIds.set(inv.id, [...pIds]);
    }

    // Batch fetch price history for all products across all purchases
    const allProdIds = new Set();
    for (const p of allPurchases) {
      for (const d of p.details) {
        allProdIds.add(d.productId);
      }
    }
    const allSupplierIds = [...new Set(orders.map(o => o.supplierId).filter(Boolean))];
    const allPriceHistory = (allProdIds.size > 0 && allSupplierIds.length > 0)
      ? await prisma.priceHistory.findMany({
          where: {
            productId: { in: [...allProdIds] },
            supplierId: { in: allSupplierIds },
            isSuperseded: false,
          },
          orderBy: { purchaseDate: 'desc' },
          select: { productId: true, supplierId: true, unitPrice: true, purchaseDate: true },
        })
      : [];

    // Setup jsPDF
    const jspdfModule = await import('jspdf');
    const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;
    const { applyPlugin } = await import('jspdf-autotable');
    applyPlugin(jsPDF);
    const pdfFontsModule = await import('@/lib/pdf-fonts');
    const addCJKFontToDoc = pdfFontsModule.addCJKFontToDoc || pdfFontsModule.default?.addCJKFontToDoc;
    const getCJKFontFamily = pdfFontsModule.getCJKFontFamily || pdfFontsModule.default?.getCJKFontFamily;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    addCJKFontToDoc(doc);
    const cjkFont = getCJKFontFamily?.() || undefined;

    for (let idx = 0; idx < orders.length; idx++) {
      const order = orders[idx];
      if (idx > 0) { doc.addPage(); if (cjkFont) doc.setFont(cjkFont, 'normal'); }

      const invoiceIds = Array.isArray(order.invoiceIds) ? order.invoiceIds.map(id => parseInt(id)) : [];
      const invoices = invoiceIds.map(id => invoiceMap.get(id)).filter(Boolean);
      const supplierName = order.supplierName || '';
      const accountName = order.accountId ? (accountMap.get(order.accountId) || '') : '';

      let executionNo = null, cashTransactionNo = null, executionDate = null;
      if (order.executions?.length > 0) {
        const exec = order.executions[0];
        executionNo = exec.executionNo;
        executionDate = exec.executionDate;
        if (exec.cashTransactionId) {
          const cashTx = cashTxMap.get(exec.cashTransactionId);
          if (cashTx) cashTransactionNo = cashTx.transactionNo;
        }
      }

      // Build product matrix for this order's purchases
      let productMapForOrder = null;
      let sortedDatesForOrder = [];
      let priceNoteItemsForOrder = [];

      const orderPurchaseIds = new Set();
      for (const invId of invoiceIds) {
        const pIds = invoiceToPurchaseIds.get(invId) || [];
        pIds.forEach(id => orderPurchaseIds.add(id));
      }

      if (orderPurchaseIds.size > 0) {
        const orderPurchases = [...orderPurchaseIds].map(id => purchaseMap.get(id)).filter(Boolean);
        if (orderPurchases.length > 0) {
          const dateSet = new Set(orderPurchases.map(p => p.purchaseDate));
          sortedDatesForOrder = Array.from(dateSet).sort();
          productMapForOrder = new Map();
          for (const purchase of orderPurchases) {
            for (const detail of purchase.details) {
              const pid = detail.productId;
              const pname = detail.product?.name || `Product#${pid}`;
              const punit = detail.product?.unit || '';
              const unitPrice = Number(detail.unitPrice);
              const qty = detail.quantity;
              const date = purchase.purchaseDate;
              const wh = purchase.warehouse || '';
              if (!productMapForOrder.has(pid)) {
                productMapForOrder.set(pid, { name: pname, unit: punit, unitPrice, warehouse: wh, dateQty: new Map(), totalQty: 0, totalAmount: 0 });
              }
              const entry = productMapForOrder.get(pid);
              entry.dateQty.set(date, (entry.dateQty.get(date) || 0) + qty);
              entry.totalQty += qty;
              entry.totalAmount += unitPrice * qty;
              entry.unitPrice = unitPrice;
            }
          }

          // Price notes for this order
          if (productMapForOrder.size > 0 && order.supplierId) {
            const earliestDate = sortedDatesForOrder[0] || '';
            const relevantHistory = allPriceHistory.filter(h => h.supplierId === order.supplierId && h.purchaseDate < earliestDate);
            const historyByProduct = new Map();
            for (const h of relevantHistory) {
              if (!historyByProduct.has(h.productId)) historyByProduct.set(h.productId, []);
              const arr = historyByProduct.get(h.productId);
              if (arr.length < 3) arr.push(h);
            }
            for (const [pid, entry] of productMapForOrder) {
              const recentHistory = historyByProduct.get(pid) || [];
              if (recentHistory.length === 0) continue;
              const recentMin = Math.min(...recentHistory.map(h => Number(h.unitPrice)));
              const currentPrice = entry.unitPrice;
              if (currentPrice > recentMin) {
                const cheapestRecord = recentHistory.find(h => Number(h.unitPrice) === recentMin);
                const priceDiff = currentPrice - recentMin;
                const diffRate = ((priceDiff / recentMin) * 100).toFixed(1);
                priceNoteItemsForOrder.push({
                  productName: entry.name, currentPrice, recentMin,
                  priceDiff: `+${priceDiff.toFixed(0)}`, diffRate: `+${diffRate}%`,
                  cheapestDate: cheapestRecord?.purchaseDate || '', historyCount: recentHistory.length,
                });
              }
            }
          }
        }
      }

      renderVoucherTablePage(doc, {
        order, invoices, supplierName, accountName,
        executionNo, executionDate, cashTransactionNo, makerName,
        pageNum: idx + 1, totalPages: orders.length,
        productMap: productMapForOrder, sortedDates: sortedDatesForOrder,
        priceNoteItems: priceNoteItemsForOrder, cjkFont,
      });
    }

    // Audit
    auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.DATA_EXPORT || 'data_export',
      targetModule: 'payment-orders',
      note: `批量匯出付款傳票 PDF: ${orders.map(o => o.orderNo).join(', ')} (共 ${orders.length} 張)`,
    }).catch(() => {});

    const pdfOutput = doc.output('arraybuffer');
    return new NextResponse(pdfOutput, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="payment-vouchers-batch-${orders.length}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

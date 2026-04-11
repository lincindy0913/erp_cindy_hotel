import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { renderVoucherTablePage } from '@/lib/voucher-pdf-renderer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/export/payment-voucher/[id]
 * Single payment voucher PDF — uses monthly voucher table format
 */
export async function GET(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.EXPORT_PDF, PERMISSIONS.FINANCE_VIEW, PERMISSIONS.PURCHASING_VIEW]);
  if (!auth.ok) return auth.response;
  if (!auth.session.user.permissions?.includes('*')) {
    const perms = auth.session.user.permissions || [];
    if (!perms.includes(PERMISSIONS.EXPORT_PDF)) {
      return createErrorResponse('FORBIDDEN', '需要匯出 PDF 權限', 403);
    }
  }

  try {
    const orderId = parseInt(params.id);
    if (isNaN(orderId)) {
      return createErrorResponse('VALIDATION_FAILED', '無效的付款單 ID', 400);
    }

    const order = await prisma.paymentOrder.findUnique({
      where: { id: orderId },
      include: { executions: true },
    });

    if (!order) {
      return createErrorResponse('NOT_FOUND', '付款單不存在', 404);
    }

    // Fetch invoices
    const invoiceIds = Array.isArray(order.invoiceIds) ? order.invoiceIds.map(id => parseInt(id)) : [];
    const invoices = invoiceIds.length > 0
      ? await prisma.salesMaster.findMany({ where: { id: { in: invoiceIds } }, include: { details: true } })
      : [];

    // Resolve supplier name
    let supplierName = order.supplierName || '';

    // Resolve account name
    let accountName = '';
    if (order.accountId) {
      const account = await prisma.cashAccount.findUnique({ where: { id: order.accountId }, select: { name: true } });
      if (account) accountName = account.name;
    }

    // Execution chain
    let executionNo = null, cashTransactionNo = null, executionDate = null;
    if (order.executions?.length > 0) {
      const exec = order.executions[0];
      executionNo = exec.executionNo;
      executionDate = exec.executionDate;
      if (exec.cashTransactionId) {
        const cashTx = await prisma.cashTransaction.findUnique({ where: { id: exec.cashTransactionId } });
        if (cashTx) cashTransactionNo = cashTx.transactionNo;
      }
    }

    const makerName = auth.session?.user?.name || auth.session?.user?.email?.split('@')[0] || '';

    // ── Fetch expense entry lines (for expense-type payment orders) ──
    let expenseLines = [];
    let expenseNote = '';
    const expenseRec = await prisma.commonExpenseRecord.findFirst({
      where: { paymentOrderId: orderId },
      include: { entryLines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (expenseRec) {
      expenseLines = expenseRec.entryLines.map(l => ({
        entryType: l.entryType,
        accountingCode: l.accountingCode,
        accountingName: l.accountingName,
        summary: l.summary,
        amount: Number(l.amount),
      }));
      expenseNote = expenseRec.note || '';
    }

    // ── Fetch related purchases via SalesDetail.purchaseId ──
    const allPurchaseIds = [];
    for (const inv of invoices) {
      if (inv.details) {
        for (const d of inv.details) {
          if (d.purchaseId) allPurchaseIds.push(d.purchaseId);
        }
      }
    }
    const uniquePurchaseIds = [...new Set(allPurchaseIds)];

    let productMap = null;
    let sortedDates = [];
    let priceNoteItems = [];

    if (uniquePurchaseIds.length > 0) {
      const purchases = await prisma.purchaseMaster.findMany({
        where: { id: { in: uniquePurchaseIds } },
        include: {
          details: { include: { product: { select: { id: true, name: true, unit: true } } } },
        },
        orderBy: { purchaseDate: 'asc' },
      });

      if (purchases.length > 0) {
        // Build product date matrix
        const dateSet = new Set(purchases.map(p => p.purchaseDate));
        sortedDates = Array.from(dateSet).sort();
        productMap = new Map();
        for (const purchase of purchases) {
          for (const detail of purchase.details) {
            const pid = detail.productId;
            const pname = detail.product?.name || `Product#${pid}`;
            const punit = detail.product?.unit || '';
            const unitPrice = Number(detail.unitPrice);
            const qty = detail.quantity;
            const date = purchase.purchaseDate;
            const wh = purchase.warehouse || '';
            if (!productMap.has(pid)) {
              productMap.set(pid, { name: pname, unit: punit, unitPrice, warehouse: wh, dateQty: new Map(), totalQty: 0, totalAmount: 0 });
            }
            const entry = productMap.get(pid);
            entry.dateQty.set(date, (entry.dateQty.get(date) || 0) + qty);
            entry.totalQty += qty;
            entry.totalAmount += unitPrice * qty;
            entry.unitPrice = unitPrice;
          }
        }

        // Price history comparison
        if (productMap.size > 0 && order.supplierId) {
          const allProductIds = [...productMap.keys()];
          const earliestDate = sortedDates[0] || '';
          const allHistory = await prisma.priceHistory.findMany({
            where: {
              productId: { in: allProductIds },
              supplierId: order.supplierId,
              isSuperseded: false,
              purchaseDate: { lt: earliestDate },
            },
            orderBy: { purchaseDate: 'desc' },
            select: { productId: true, unitPrice: true, purchaseDate: true },
          });
          const historyByProduct = new Map();
          for (const h of allHistory) {
            if (!historyByProduct.has(h.productId)) historyByProduct.set(h.productId, []);
            const arr = historyByProduct.get(h.productId);
            if (arr.length < 3) arr.push(h);
          }
          for (const [pid, entry] of productMap) {
            const recentHistory = historyByProduct.get(pid) || [];
            if (recentHistory.length === 0) continue;
            const recentMin = Math.min(...recentHistory.map(h => Number(h.unitPrice)));
            const currentPrice = entry.unitPrice;
            if (currentPrice > recentMin) {
              const cheapestRecord = recentHistory.find(h => Number(h.unitPrice) === recentMin);
              const priceDiff = currentPrice - recentMin;
              const diffRate = ((priceDiff / recentMin) * 100).toFixed(1);
              priceNoteItems.push({
                productName: entry.name, currentPrice, recentMin,
                priceDiff: `+${priceDiff.toFixed(0)}`, diffRate: `+${diffRate}%`,
                cheapestDate: cheapestRecord?.purchaseDate || '', historyCount: recentHistory.length,
              });
            }
          }
        }
      }
    }

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

    renderVoucherTablePage(doc, {
      order, invoices, supplierName, accountName,
      executionNo, executionDate, cashTransactionNo, makerName,
      productMap, sortedDates, priceNoteItems,
      expenseLines, expenseNote,
      cjkFont,
    });

    // Audit
    auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.DATA_EXPORT || 'data_export',
      targetModule: 'payment-orders',
      targetRecordId: orderId,
      targetRecordNo: order.orderNo,
      note: `匯出付款傳票 PDF: ${order.orderNo}`,
    }).catch(() => {});

    const pdfOutput = doc.output('arraybuffer');
    return new NextResponse(pdfOutput, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="payment-voucher-${order.orderNo || orderId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

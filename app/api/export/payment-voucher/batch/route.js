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

    // Setup jsPDF
    const jspdfModule = await import('jspdf');
    const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;
    const { applyPlugin } = await import('jspdf-autotable');
    applyPlugin(jsPDF);
    const pdfFontsModule = await import('@/lib/pdf-fonts');
    const addCJKFontToDoc = pdfFontsModule.addCJKFontToDoc || pdfFontsModule.default?.addCJKFontToDoc;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    addCJKFontToDoc(doc);

    for (let idx = 0; idx < orders.length; idx++) {
      const order = orders[idx];
      if (idx > 0) doc.addPage();

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

      renderVoucherTablePage(doc, {
        order, invoices, supplierName, accountName,
        executionNo, executionDate, cashTransactionNo, makerName,
        pageNum: idx + 1, totalPages: orders.length,
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

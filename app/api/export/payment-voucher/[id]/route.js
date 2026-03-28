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

    // Setup jsPDF
    const jspdfModule = await import('jspdf');
    const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;
    const { applyPlugin } = await import('jspdf-autotable');
    applyPlugin(jsPDF);
    const pdfFontsModule = await import('@/lib/pdf-fonts');
    const addCJKFontToDoc = pdfFontsModule.addCJKFontToDoc || pdfFontsModule.default?.addCJKFontToDoc;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    addCJKFontToDoc(doc);

    renderVoucherTablePage(doc, {
      order, invoices, supplierName, accountName,
      executionNo, executionDate, cashTransactionNo, makerName,
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

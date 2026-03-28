import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/export/payment-voucher/batch
 * Batch PDF generation: multiple payment vouchers in one PDF (one per page)
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

    if (ids.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '請至少選擇一張傳票', 400);
    }
    if (ids.length > 50) {
      return createErrorResponse('VALIDATION_FAILED', '一次最多列印 50 張傳票', 400);
    }

    // Fetch all orders
    const orders = await prisma.paymentOrder.findMany({
      where: { id: { in: ids } },
      include: { executions: true },
      orderBy: { createdAt: 'desc' },
    });

    if (orders.length === 0) {
      return createErrorResponse('NOT_FOUND', '找不到付款單', 404);
    }

    // Collect all invoice IDs
    const allInvoiceIds = [];
    for (const order of orders) {
      const invIds = Array.isArray(order.invoiceIds) ? order.invoiceIds.map(id => parseInt(id)) : [];
      allInvoiceIds.push(...invIds);
    }

    // Batch fetch invoices
    const allInvoices = allInvoiceIds.length > 0
      ? await prisma.salesMaster.findMany({
          where: { id: { in: [...new Set(allInvoiceIds)] } },
          include: { details: true },
        })
      : [];
    const invoiceMap = new Map(allInvoices.map(inv => [inv.id, inv]));

    // Batch fetch cash transactions for executions
    const cashTxIds = orders.flatMap(o => o.executions?.map(e => e.cashTransactionId).filter(Boolean) || []);
    const cashTxs = cashTxIds.length > 0
      ? await prisma.cashTransaction.findMany({ where: { id: { in: [...new Set(cashTxIds)] } } })
      : [];
    const cashTxMap = new Map(cashTxs.map(tx => [tx.id, tx]));

    // Setup jsPDF
    const jspdfModule = await import('jspdf');
    const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;
    const { applyPlugin } = await import('jspdf-autotable');
    applyPlugin(jsPDF);
    const pdfFontsModule = await import('@/lib/pdf-fonts');
    const addCJKFontToDoc = pdfFontsModule.addCJKFontToDoc || pdfFontsModule.default?.addCJKFontToDoc;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    addCJKFontToDoc(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    for (let idx = 0; idx < orders.length; idx++) {
      const order = orders[idx];
      if (idx > 0) doc.addPage();

      // Gather invoices for this order
      const invoiceIds = Array.isArray(order.invoiceIds) ? order.invoiceIds.map(id => parseInt(id)) : [];
      const invoices = invoiceIds.map(id => invoiceMap.get(id)).filter(Boolean);

      let supplierName = order.supplierName || '';

      // Execution info
      let executionNo = null;
      let cashTransactionNo = null;
      let executionDate = null;
      if (order.executions?.length > 0) {
        const exec = order.executions[0];
        executionNo = exec.executionNo;
        executionDate = exec.executionDate;
        if (exec.cashTransactionId) {
          const cashTx = cashTxMap.get(exec.cashTransactionId);
          if (cashTx) cashTransactionNo = cashTx.transactionNo;
        }
      }

      // === Render single voucher page ===
      renderVoucherPage(doc, order, invoices, supplierName, executionNo, executionDate, cashTransactionNo, pageWidth, margin, idx + 1, orders.length);
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

function renderVoucherPage(doc, order, invoices, supplierName, executionNo, executionDate, cashTransactionNo, pageWidth, margin, pageNum, totalPages) {
  // Header
  doc.setFontSize(20);
  doc.setTextColor(50, 50, 50);
  doc.text('付款傳票', pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(10);
  doc.text('進銷存系統', pageWidth / 2, 27, { align: 'center' });

  doc.setDrawColor(68, 114, 196);
  doc.setLineWidth(0.8);
  doc.line(margin, 31, pageWidth - margin, 31);

  // Page indicator for batch
  if (totalPages > 1) {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`第 ${pageNum} / ${totalPages} 張`, pageWidth - margin, 18, { align: 'right' });
  }

  // Details
  let y = 38;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const leftCol = margin;
  const rightCol = pageWidth / 2 + 10;

  doc.setFont(undefined, 'bold');
  doc.text('付款單號:', leftCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(order.orderNo || '-', leftCol + 25, y);

  doc.setFont(undefined, 'bold');
  doc.text('建立日期:', rightCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(order.createdAt ? new Date(order.createdAt).toLocaleDateString('zh-TW') : '-', rightCol + 25, y);

  y += 7;
  doc.setFont(undefined, 'bold');
  doc.text('付款方式:', leftCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(order.paymentMethod || '-', leftCol + 25, y);

  doc.setFont(undefined, 'bold');
  doc.text('狀態:', rightCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(order.status || '-', rightCol + 25, y);

  y += 7;
  doc.setFont(undefined, 'bold');
  doc.text('應付淨額:', leftCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(`NT$ ${Number(order.netAmount).toLocaleString()}`, leftCol + 25, y);

  if (Number(order.discount) > 0) {
    doc.setFont(undefined, 'bold');
    doc.text('折讓金額:', rightCol, y);
    doc.setFont(undefined, 'normal');
    doc.text(`NT$ ${Number(order.discount).toLocaleString()}`, rightCol + 25, y);
  }

  y += 7;
  doc.setFont(undefined, 'bold');
  doc.text('供應商:', leftCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(supplierName || '-', leftCol + 25, y);

  if (order.warehouse) {
    doc.setFont(undefined, 'bold');
    doc.text('館別:', rightCol, y);
    doc.setFont(undefined, 'normal');
    doc.text(order.warehouse, rightCol + 25, y);
  }

  if (order.checkNo) {
    y += 7;
    doc.setFont(undefined, 'bold');
    doc.text('支票號碼:', leftCol, y);
    doc.setFont(undefined, 'normal');
    doc.text(order.checkNo || '-', leftCol + 25, y);

    doc.setFont(undefined, 'bold');
    doc.text('支票到期日:', rightCol, y);
    doc.setFont(undefined, 'normal');
    doc.text(order.checkDueDate || '-', rightCol + 28, y);
  }

  if (order.note) {
    y += 7;
    doc.setFont(undefined, 'bold');
    doc.text('備註:', leftCol, y);
    doc.setFont(undefined, 'normal');
    const noteText = order.note.length > 60 ? order.note.substring(0, 60) + '...' : order.note;
    doc.text(noteText, leftCol + 25, y);
  }

  // Traceability chain
  y += 10;
  doc.setDrawColor(46, 125, 50);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  y += 5;
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(46, 125, 50);
  doc.text('追蹤鏈', margin, y);

  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont(undefined, 'normal');

  const invoiceNos = invoices.map(inv => inv.invoiceNo || inv.salesNo || '-').join(', ');
  const chainParts = [`發票: ${invoiceNos || '(無)'}`, `付款單: ${order.orderNo}`];
  if (executionNo) chainParts.push(`出納單: ${executionNo}`);
  if (cashTransactionNo) chainParts.push(`現金流: ${cashTransactionNo}`);
  doc.text(chainParts.join('  ->  '), margin, y);

  if (executionDate) {
    y += 5;
    doc.setFontSize(7);
    doc.text(`出納執行日期: ${executionDate}`, margin, y);
  }

  // Invoice table
  y += 8;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  y += 5;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(50, 50, 50);
  doc.text('發票明細', margin, y);
  y += 3;

  if (invoices.length > 0) {
    const tableData = invoices.map(inv => [
      inv.invoiceNo || inv.salesNo || '-',
      inv.invoiceDate || '-',
      inv.invoiceTitle || '-',
      inv.taxType || '-',
      `NT$ ${Number(inv.amount || 0).toLocaleString()}`,
      `NT$ ${Number(inv.tax || 0).toLocaleString()}`,
      `NT$ ${Number(inv.totalAmount || 0).toLocaleString()}`,
    ]);

    doc.autoTable({
      startY: y,
      head: [['發票號碼', '發票日期', '發票抬頭', '稅別', '金額', '稅額', '合計']],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2.5, lineColor: [200, 200, 200], lineWidth: 0.3 },
      headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center' }, 1: { halign: 'center' }, 2: { halign: 'left' },
        3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: margin, right: margin },
    });

    const finalY = doc.lastAutoTable.finalY + 5;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(50, 50, 50);
    const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
    doc.text(`發票合計: NT$ ${totalAmount.toLocaleString()}`, pageWidth - margin, finalY, { align: 'right' });
    y = finalY;
  } else {
    y += 5;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('無關聯發票', pageWidth / 2, y, { align: 'center' });
  }

  // Signature lines
  const signatureY = Math.max(y + 30, 230);
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.setFont(undefined, 'normal');

  const sigWidth = 45;
  const sigGap = 15;
  const totalSigWidth = sigWidth * 3 + sigGap * 2;
  const sigStartX = (pageWidth - totalSigWidth) / 2;

  doc.line(sigStartX, signatureY, sigStartX + sigWidth, signatureY);
  doc.text('製表人', sigStartX + sigWidth / 2, signatureY + 5, { align: 'center' });

  const sig2X = sigStartX + sigWidth + sigGap;
  doc.line(sig2X, signatureY, sig2X + sigWidth, signatureY);
  doc.text('覆核人', sig2X + sigWidth / 2, signatureY + 5, { align: 'center' });

  const sig3X = sig2X + sigWidth + sigGap;
  doc.line(sig3X, signatureY, sig3X + sigWidth, signatureY);
  doc.text('核准人', sig3X + sigWidth / 2, signatureY + 5, { align: 'center' });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(180, 180, 180);
  doc.text(
    `列印日期: ${new Date().toLocaleDateString('zh-TW')} ${new Date().toLocaleTimeString('zh-TW')}`,
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 8,
    { align: 'center' }
  );
}

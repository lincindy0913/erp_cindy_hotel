import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/export/payment-voucher/[id]
 * Server-side PDF generation for payment voucher (付款傳票)
 * Now queries PaymentOrder -> CashierExecution -> CashTransaction chain
 * Returns a PDF document as a downloadable response
 */
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPORT_PDF);
  if (!auth.ok) return auth.response;
  
  try {
    const orderId = parseInt(params.id);

    if (isNaN(orderId)) {
      return createErrorResponse('VALIDATION_FAILED', '無效的付款單 ID', 400);
    }

    // Query the PaymentOrder with executions
    const order = await prisma.paymentOrder.findUnique({
      where: { id: orderId },
      include: { executions: true },
    });

    if (!order) {
      // Fallback: try legacy Payment model
      const legacyPayment = await prisma.payment.findUnique({ where: { id: orderId } });
      if (legacyPayment) {
        return generateLegacyPdf(legacyPayment, orderId);
      }
      return createErrorResponse('NOT_FOUND', '付款單不存在', 404);
    }

    // Fetch associated invoices (SalesMaster records)
    const invoiceIds = Array.isArray(order.invoiceIds) ? order.invoiceIds.map(id => parseInt(id)) : [];
    let invoices = [];
    let supplierName = order.supplierName || '';

    if (invoiceIds.length > 0) {
      invoices = await prisma.salesMaster.findMany({
        where: { id: { in: invoiceIds } },
        include: { details: true },
      });

      // Try to get supplier name if not already on order
      if (!supplierName) {
        for (const invoice of invoices) {
          if (supplierName) break;
          for (const detail of invoice.details) {
            if (detail.purchaseId) {
              const purchase = await prisma.purchaseMaster.findUnique({
                where: { id: detail.purchaseId },
                include: { supplier: { select: { name: true } } },
              });
              if (purchase?.supplier?.name) {
                supplierName = purchase.supplier.name;
                break;
              }
            }
          }
        }
      }
    }

    // Build traceability chain
    let executionNo = null;
    let cashTransactionNo = null;
    let executionDate = null;

    if (order.executions && order.executions.length > 0) {
      const exec = order.executions[0];
      executionNo = exec.executionNo;
      executionDate = exec.executionDate;

      if (exec.cashTransactionId) {
        const cashTx = await prisma.cashTransaction.findUnique({
          where: { id: exec.cashTransactionId },
        });
        if (cashTx) {
          cashTransactionNo = cashTx.transactionNo;
        }
      }
    }

    // Generate the PDF using jsPDF (中文字體避免亂碼)
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const { addCJKFontToDoc } = require('@/lib/pdf-fonts');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    addCJKFontToDoc(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    // === Company header ===
    doc.setFontSize(20);
    doc.text('付款傳票', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.text('進銷存系統', pageWidth / 2, 27, { align: 'center' });

    // Horizontal line
    doc.setDrawColor(68, 114, 196);
    doc.setLineWidth(0.8);
    doc.line(margin, 31, pageWidth - margin, 31);

    // === Payment details section ===
    let y = 38;
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);

    const leftCol = margin;
    const rightCol = pageWidth / 2 + 10;

    // Row 1
    doc.setFont(undefined, 'bold');
    doc.text('付款單號:', leftCol, y);
    doc.setFont(undefined, 'normal');
    doc.text(order.orderNo || '-', leftCol + 25, y);

    doc.setFont(undefined, 'bold');
    doc.text('建立日期:', rightCol, y);
    doc.setFont(undefined, 'normal');
    doc.text(order.createdAt ? new Date(order.createdAt).toLocaleDateString('zh-TW') : '-', rightCol + 25, y);

    // Row 2
    y += 7;
    doc.setFont(undefined, 'bold');
    doc.text('付款方式:', leftCol, y);
    doc.setFont(undefined, 'normal');
    doc.text(order.paymentMethod || '-', leftCol + 25, y);

    doc.setFont(undefined, 'bold');
    doc.text('狀態:', rightCol, y);
    doc.setFont(undefined, 'normal');
    doc.text(order.status || '-', rightCol + 25, y);

    // Row 3
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

    // Row 4 - Supplier
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

    // Row 5 - Check info (if applicable)
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

    if (order.checkAccount) {
      y += 7;
      doc.setFont(undefined, 'bold');
      doc.text('支票帳戶:', leftCol, y);
      doc.setFont(undefined, 'normal');
      doc.text(order.checkAccount || '-', leftCol + 25, y);

      if (order.checkIssueDate) {
        doc.setFont(undefined, 'bold');
        doc.text('開票日期:', rightCol, y);
        doc.setFont(undefined, 'normal');
        doc.text(order.checkIssueDate, rightCol + 25, y);
      }
    }

    // Row - Note
    if (order.note) {
      y += 7;
      doc.setFont(undefined, 'bold');
      doc.text('備註:', leftCol, y);
      doc.setFont(undefined, 'normal');
      const noteText = order.note.length > 60 ? order.note.substring(0, 60) + '...' : order.note;
      doc.text(noteText, leftCol + 25, y);
    }

    // === Traceability Chain Section ===
    y += 10;
    doc.setDrawColor(46, 125, 50); // green line
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

    // Invoice numbers
    const invoiceNos = invoices.map(inv => inv.invoiceNo || inv.salesNo || '-').join(', ');
    const chainParts = [];
    chainParts.push(`發票: ${invoiceNos || '(無)'}`);
    chainParts.push(`付款單: ${order.orderNo}`);
    if (executionNo) {
      chainParts.push(`出納單: ${executionNo}`);
    }
    if (cashTransactionNo) {
      chainParts.push(`現金流: ${cashTransactionNo}`);
    }

    const chainText = chainParts.join('  ->  ');
    doc.text(chainText, margin, y);

    if (executionDate) {
      y += 5;
      doc.setFontSize(7);
      doc.text(`出納執行日期: ${executionDate}`, margin, y);
    }

    // === Invoice table ===
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
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          lineColor: [200, 200, 200],
          lineWidth: 0.3,
        },
        headStyles: {
          fillColor: [68, 114, 196],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        columnStyles: {
          0: { halign: 'center' },
          1: { halign: 'center' },
          2: { halign: 'left' },
          3: { halign: 'center' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { left: margin, right: margin },
      });

      // Total row after table
      const finalY = doc.lastAutoTable.finalY + 5;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(50, 50, 50);

      const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
      doc.text(
        `發票合計: NT$ ${totalAmount.toLocaleString()}`,
        pageWidth - margin,
        finalY,
        { align: 'right' }
      );

      y = finalY;
    } else {
      y += 5;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text('無關聯發票', pageWidth / 2, y, { align: 'center' });
    }

    // === Signature lines ===
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

    // Signature line 1: 製表人
    doc.line(sigStartX, signatureY, sigStartX + sigWidth, signatureY);
    doc.text('製表人', sigStartX + sigWidth / 2, signatureY + 5, { align: 'center' });

    // Signature line 2: 覆核人
    const sig2X = sigStartX + sigWidth + sigGap;
    doc.line(sig2X, signatureY, sig2X + sigWidth, signatureY);
    doc.text('覆核人', sig2X + sigWidth / 2, signatureY + 5, { align: 'center' });

    // Signature line 3: 核准人
    const sig3X = sig2X + sigWidth + sigGap;
    doc.line(sig3X, signatureY, sig3X + sigWidth, signatureY);
    doc.text('核准人', sig3X + sigWidth / 2, signatureY + 5, { align: 'center' });

    // Footer: date stamp
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(
      `列印日期: ${new Date().toLocaleDateString('zh-TW')} ${new Date().toLocaleTimeString('zh-TW')}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );

    // Convert to buffer and return as response
    const pdfOutput = doc.output('arraybuffer');

    return new NextResponse(pdfOutput, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="payment-voucher-${order.orderNo || orderId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Legacy fallback for old Payment model records
 */
async function generateLegacyPdf(payment, paymentId) {
  const invoiceIds = Array.isArray(payment.invoiceIds) ? payment.invoiceIds.map(id => parseInt(id)) : [];
  let invoices = [];
  let supplierName = '';

  if (invoiceIds.length > 0) {
    const prismaClient = (await import('@/lib/prisma')).default;
    invoices = await prismaClient.salesMaster.findMany({
      where: { id: { in: invoiceIds } },
      include: { details: true },
    });

    for (const invoice of invoices) {
      if (supplierName) break;
      for (const detail of invoice.details) {
        if (detail.purchaseId) {
          const purchase = await prismaClient.purchaseMaster.findUnique({
            where: { id: detail.purchaseId },
            include: { supplier: { select: { name: true } } },
          });
          if (purchase?.supplier?.name) {
            supplierName = purchase.supplier.name;
            break;
          }
        }
      }
    }
  }

  const { default: jsPDF } = await import('jspdf');
  await import('jspdf-autotable');
  const { addCJKFontToDoc } = require('@/lib/pdf-fonts');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addCJKFontToDoc(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  doc.setFontSize(20);
  doc.text('付款傳票', pageWidth / 2, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.text('進銷存系統', pageWidth / 2, 27, { align: 'center' });

  doc.setDrawColor(68, 114, 196);
  doc.setLineWidth(0.8);
  doc.line(margin, 31, pageWidth - margin, 31);

  let y = 38;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const leftCol = margin;
  const rightCol = pageWidth / 2 + 10;

  doc.setFont(undefined, 'bold');
  doc.text('付款單號:', leftCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(payment.paymentNo || '-', leftCol + 25, y);

  doc.setFont(undefined, 'bold');
  doc.text('付款日期:', rightCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(payment.paymentDate || '-', rightCol + 25, y);

  y += 7;
  doc.setFont(undefined, 'bold');
  doc.text('付款方式:', leftCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(payment.paymentMethod || '-', leftCol + 25, y);

  y += 7;
  doc.setFont(undefined, 'bold');
  doc.text('付款金額:', leftCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(`NT$ ${Number(payment.amount).toLocaleString()}`, leftCol + 25, y);

  y += 7;
  doc.setFont(undefined, 'bold');
  doc.text('供應商:', leftCol, y);
  doc.setFont(undefined, 'normal');
  doc.text(supplierName || '-', leftCol + 25, y);

  y += 10;
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
    y = doc.lastAutoTable.finalY + 5;
  }

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

  doc.setFontSize(7);
  doc.setTextColor(180, 180, 180);
  doc.text(
    `列印日期: ${new Date().toLocaleDateString('zh-TW')} ${new Date().toLocaleTimeString('zh-TW')}`,
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 8,
    { align: 'center' }
  );

  const pdfOutput = doc.output('arraybuffer');

  return new NextResponse(pdfOutput, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payment-voucher-${payment.paymentNo || paymentId}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

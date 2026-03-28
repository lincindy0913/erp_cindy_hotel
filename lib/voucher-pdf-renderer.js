/**
 * Shared voucher PDF renderer — monthly voucher table format
 * Used by: /api/export/payment-voucher/[id], /api/export/payment-voucher/batch
 */

/**
 * Render a single payment voucher page in the monthly voucher table format
 * @param {jsPDF} doc - jsPDF document instance
 * @param {Object} opts - rendering options
 */
export function renderVoucherTablePage(doc, opts) {
  const {
    order,             // PaymentOrder record
    invoices = [],     // SalesMaster records
    supplierName = '', // resolved supplier name
    accountName = '',  // resolved CashAccount name
    executionNo = null,
    executionDate = null,
    cashTransactionNo = null,
    makerName = '',
    pageNum = 1,
    totalPages = 1,
  } = opts;

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const warehouseDisplay = order.warehouse || '-';
  const printDate = new Date();
  const printDateStr = `${printDate.getFullYear()}/${printDate.getMonth() + 1}/${printDate.getDate()}`;

  // ===== Title =====
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'bold');
  doc.text(`${warehouseDisplay}  傳 票`, pageWidth / 2, 14, { align: 'center' });

  // Page indicator
  if (totalPages > 1) {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`第 ${pageNum} / ${totalPages} 張`, pageWidth - margin, 10, { align: 'right' });
  }

  let y = 18;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);

  // ===== Supplier / Order info row =====
  const infoRowH = 7;
  doc.rect(margin, y, contentWidth, infoRowH);
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  const infoCols = [
    { w: contentWidth * 0.18, label: '付款單號', text: order.orderNo || '-' },
    { w: contentWidth * 0.15, label: '廠商', text: supplierName || '-' },
    { w: contentWidth * 0.12, label: '付款方式', text: order.paymentMethod || '-' },
    { w: contentWidth * 0.13, label: '狀態', text: order.status || '-' },
    { w: contentWidth * 0.15, label: '製表日期', text: printDateStr },
    { w: contentWidth * 0.27, label: '製表人', text: makerName || '-' },
  ];

  let cx = margin;
  for (let i = 0; i < infoCols.length; i++) {
    const col = infoCols[i];
    if (i > 0) doc.line(cx, y, cx, y + infoRowH);
    const textY = y + infoRowH / 2 + 1.2;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(6.5);
    doc.text(col.label, cx + 1.5, y + 2.5);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.text(col.text, cx + 1.5, textY + 1);
    cx += col.w;
  }
  y += infoRowH;

  // ===== Payment summary table =====
  const payHeaders = ['付款日期', '帳戶', '支票', '發票$', '折讓', '付款金額', '備註'];
  const payColWidths = [
    contentWidth * 0.14, contentWidth * 0.14, contentWidth * 0.14,
    contentWidth * 0.14, contentWidth * 0.10, contentWidth * 0.18, contentWidth * 0.16,
  ];
  const payRowH = 6;

  // Header row
  doc.rect(margin, y, contentWidth, payRowH);
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y, contentWidth, payRowH, 'F');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(7.5);
  cx = margin;
  for (let i = 0; i < payHeaders.length; i++) {
    if (i > 0) doc.line(cx, y, cx, y + payRowH);
    doc.text(payHeaders[i], cx + payColWidths[i] / 2, y + payRowH / 2 + 1, { align: 'center' });
    cx += payColWidths[i];
  }
  y += payRowH;

  // Data row
  const execDate = executionDate || (order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 10) : '');
  const invoiceTotal = Number(order.amount || 0);
  const discount = Number(order.discount || 0);
  const netAmount = Number(order.netAmount || 0);

  const rowValues = [
    execDate,
    accountName || '-',
    order.checkNo || '',
    invoiceTotal ? invoiceTotal.toLocaleString() : '',
    discount ? discount.toLocaleString() : '',
    netAmount ? netAmount.toLocaleString() : '',
    order.paymentMethod || '',
  ];

  doc.rect(margin, y, contentWidth, payRowH);
  doc.setFont(undefined, 'normal');
  cx = margin;
  for (let i = 0; i < payHeaders.length; i++) {
    if (i > 0) doc.line(cx, y, cx, y + payRowH);
    if (rowValues[i]) {
      const align = (i >= 3 && i <= 5) ? 'right' : 'left';
      const tx = align === 'right' ? cx + payColWidths[i] - 2 : cx + 2;
      doc.text(rowValues[i], tx, y + payRowH / 2 + 1, { align });
    }
    cx += payColWidths[i];
  }
  y += payRowH;

  // 合計 row
  doc.rect(margin, y, contentWidth, payRowH);
  doc.setFont(undefined, 'bold');
  const totalLabelX = margin + payColWidths[0] + payColWidths[1] + payColWidths[2];
  doc.line(totalLabelX, y, totalLabelX, y + payRowH);
  doc.text('合計', totalLabelX + 2, y + payRowH / 2 + 1);
  // 發票$
  doc.text(invoiceTotal.toLocaleString(), totalLabelX + payColWidths[3] - 2, y + payRowH / 2 + 1, { align: 'right' });
  // 折讓
  const discX = totalLabelX + payColWidths[3];
  doc.line(discX, y, discX, y + payRowH);
  if (discount > 0) doc.text(discount.toLocaleString(), discX + payColWidths[4] - 2, y + payRowH / 2 + 1, { align: 'right' });
  // 付款金額
  const payAmtX = discX + payColWidths[4];
  doc.line(payAmtX, y, payAmtX, y + payRowH);
  doc.text(netAmount.toLocaleString(), payAmtX + payColWidths[5] - 2, y + payRowH / 2 + 1, { align: 'right' });
  // 備註
  const noteX = payAmtX + payColWidths[5];
  doc.line(noteX, y, noteX, y + payRowH);
  y += payRowH;

  // ===== Check info row (if applicable) =====
  if (order.checkNo || order.checkAccount) {
    const checkRowH = 6;
    doc.rect(margin, y, contentWidth, checkRowH);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7.5);
    let checkStr = '';
    if (order.checkNo) checkStr += `支票號碼: ${order.checkNo}`;
    if (order.checkAccount) checkStr += `  帳戶: ${order.checkAccount}`;
    if (order.checkIssueDate) checkStr += `  開票日: ${order.checkIssueDate}`;
    if (order.checkDueDate) checkStr += `  到期日: ${order.checkDueDate}`;
    doc.text(checkStr, margin + 3, y + checkRowH / 2 + 1);
    y += checkRowH;
  }

  // ===== Invoice details section =====
  const maxInvoiceRows = Math.max(invoices.length, 3);
  const invRowH = 5.5;
  const invSectionH = maxInvoiceRows * invRowH + 2;
  doc.rect(margin, y, contentWidth, invSectionH);

  doc.setFontSize(7.5);
  doc.setFont(undefined, 'normal');

  const invLeftW = contentWidth * 0.60;
  const invRightW = contentWidth * 0.40;
  doc.line(margin + invLeftW, y, margin + invLeftW, y + invSectionH);

  let invY = y + invRowH - 0.5;

  // Compute invoice totals
  let invoiceSubtotal = 0, invoiceTaxTotal = 0, invoiceGrandTotal = 0;
  for (const inv of invoices) {
    invoiceSubtotal += Number(inv.amount || 0);
    invoiceTaxTotal += Number(inv.tax || 0);
    invoiceGrandTotal += Number(inv.totalAmount || 0);
  }

  if (invoices.length > 0) {
    for (const inv of invoices) {
      doc.setFont(undefined, 'bold');
      doc.text('發票日期', margin + 2, invY);
      doc.setFont(undefined, 'normal');
      doc.text(inv.invoiceDate || '', margin + 20, invY);
      doc.text(inv.invoiceNo || '', margin + 48, invY);
      doc.text(Number(inv.amount || 0).toLocaleString(), margin + invLeftW - 3, invY, { align: 'right' });
      invY += invRowH;
    }
  } else {
    // No invoices — show summary info
    doc.setFont(undefined, 'normal');
    doc.setTextColor(120, 120, 120);
    if (order.summary) {
      doc.text(order.summary.length > 50 ? order.summary.substring(0, 50) + '...' : order.summary, margin + 2, invY);
      invY += invRowH;
    }
    if (order.note) {
      doc.text(`備註: ${order.note.length > 50 ? order.note.substring(0, 50) + '...' : order.note}`, margin + 2, invY);
    }
    doc.setTextColor(0, 0, 0);
  }

  // Right side: tax / traceability
  let taxY = y + invRowH - 0.5;
  const taxLabelX = margin + invLeftW + 3;
  const taxValueX = margin + contentWidth - 3;

  if (invoices.length > 0) {
    doc.setFont(undefined, 'bold');
    doc.text('含稅', taxLabelX, taxY);
    doc.text(`稅: ${invoiceTaxTotal.toLocaleString()}`, taxLabelX + 20, taxY);
    doc.setFont(undefined, 'normal');
    doc.text(`$ ${invoiceGrandTotal.toLocaleString()}`, taxValueX, taxY, { align: 'right' });
  }

  // Traceability chain
  taxY += invRowH * 1.5;
  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(46, 125, 50);
  doc.text('追蹤鏈:', taxLabelX, taxY);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  taxY += 4;
  doc.text(`付款單: ${order.orderNo}`, taxLabelX, taxY);
  if (executionNo) {
    taxY += 3.5;
    doc.text(`出納單: ${executionNo}`, taxLabelX, taxY);
  }
  if (cashTransactionNo) {
    taxY += 3.5;
    doc.text(`現金流: ${cashTransactionNo}`, taxLabelX, taxY);
  }
  doc.setTextColor(0, 0, 0);

  y += invSectionH;

  // ===== Totals row =====
  const totRowH = 6;
  doc.rect(margin, y, contentWidth, totRowH);
  doc.line(margin + contentWidth / 2, y, margin + contentWidth / 2, y + totRowH);
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');

  const leftTotal = invoices.length > 0 ? `發票小計: ${invoiceSubtotal.toLocaleString()}` : `金額: ${invoiceTotal.toLocaleString()}`;
  const rightTotal = invoices.length > 0 ? `含稅合計: ${invoiceGrandTotal.toLocaleString()}` : `應付淨額: ${netAmount.toLocaleString()}`;
  doc.text(leftTotal, margin + contentWidth / 4, y + totRowH / 2 + 1, { align: 'center' });
  doc.text(rightTotal, margin + contentWidth * 3 / 4, y + totRowH / 2 + 1, { align: 'center' });
  y += totRowH;

  // ===== Signature row =====
  const sigRowH = 7;
  doc.rect(margin, y, contentWidth, sigRowH);
  doc.setFontSize(8);
  const sigLabels = ['覆核:', '核准:', '會計:', `製表人: ${makerName}`];
  const sigColW = contentWidth / 4;
  for (let i = 0; i < sigLabels.length; i++) {
    if (i > 0) doc.line(margin + i * sigColW, y, margin + i * sigColW, y + sigRowH);
    doc.setFont(undefined, 'normal');
    doc.text(sigLabels[i], margin + i * sigColW + 3, y + sigRowH / 2 + 1);
  }
  y += sigRowH;

  // ===== Footer =====
  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text(
    `列印日期: ${printDateStr} ${printDate.toLocaleTimeString('zh-TW')}`,
    pageWidth / 2,
    doc.internal.pageSize.getHeight() - 8,
    { align: 'center' }
  );
}

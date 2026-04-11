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
    // Purchase detail matrix data (optional)
    productMap = null,     // Map<pid, { name, unit, unitPrice, warehouse, dateQty: Map, totalQty, totalAmount }>
    sortedDates = [],      // sorted purchase date strings
    priceNoteItems = [],   // [{ productName, currentPrice, recentMin, priceDiff, diffRate, cheapestDate }]
    // Expense entry lines (for expense vouchers from /expenses page)
    expenseLines = [],     // [{ entryType, accountingCode, accountingName, summary, amount }]
    expenseNote = '',      // CommonExpenseRecord.note
    cjkFont = undefined,
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

  // ===== SECTION 2: Expense entry lines (費用明細) =====
  if (expenseLines && expenseLines.length > 0) {
    const pageHeight = doc.internal.pageSize.getHeight();
    y += 5;
    if (y + 40 > pageHeight - 15) { doc.addPage(); if (cjkFont) doc.setFont(cjkFont, 'normal'); y = 12; }

    // Section header line
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentWidth, y);
    y += 4;

    // Separate debit / credit lines
    const debitLines = expenseLines.filter(l => l.entryType === 'debit');
    const creditLines = expenseLines.filter(l => l.entryType === 'credit');

    const renderExpenseTable = (lines, label, fillColor) => {
      if (lines.length === 0) return;
      const head = [[label, '科目代號', '科目名稱', '摘要', '金額']];
      const body = lines.map((l, idx) => [
        String(idx + 1),
        l.accountingCode || '',
        l.accountingName || '',
        l.summary || '',
        Number(l.amount).toLocaleString(),
      ]);
      const lineTotal = lines.reduce((s, l) => s + Number(l.amount), 0);
      body.push(['', '', '', '小計', lineTotal.toLocaleString()]);

      doc.autoTable({
        startY: y,
        head,
        body,
        styles: { fontSize: 8, cellPadding: 1.8, lineColor: [180, 180, 180], lineWidth: 0.2, textColor: [0, 0, 0], ...(cjkFont && { font: cjkFont }) },
        headStyles: { fillColor, textColor: [30, 30, 30], fontStyle: 'bold', halign: 'center', fontSize: 8, ...(cjkFont && { font: cjkFont }) },
        alternateRowStyles: { fillColor: [252, 252, 252] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 22 },
          2: { cellWidth: 36 },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 28, halign: 'right' },
        },
        didParseCell: (data) => {
          if (data.row.index === body.length - 1) {
            data.cell.styles.fillColor = [235, 235, 235];
            data.cell.styles.fontStyle = 'bold';
          }
        },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable.finalY + 3;
    };

    renderExpenseTable(debitLines, '借方明細', [210, 225, 245]);
    renderExpenseTable(creditLines, '貸方明細', [225, 245, 215]);

    // Note
    if (expenseNote) {
      if (y + 10 > pageHeight - 15) { doc.addPage(); if (cjkFont) doc.setFont(cjkFont, 'normal'); y = 12; }
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`備註：${expenseNote}`, margin + 1, y + 4);
      y += 8;
      doc.setTextColor(0, 0, 0);
    }
  }

  // ===== SECTION 3: Purchase detail matrix =====
  if (productMap && productMap.size > 0 && sortedDates.length > 0) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const isLandscape = false; // payment vouchers are always portrait
    const tableFS = 8;
    const PAGES_BATCH = 14;
    const totalDateBatches = Math.ceil(sortedDates.length / PAGES_BATCH);
    let grandTotal = 0;
    const products = Array.from(productMap.entries());

    y += 6;
    if (y + 30 > pageHeight - 15) { doc.addPage(); if (cjkFont) doc.setFont(cjkFont, 'normal'); y = 12; }

    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(80, 80, 80);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentWidth, y);
    y += 4;

    for (let batch = 0; batch < totalDateBatches; batch++) {
      if (batch > 0) { doc.addPage(); if (cjkFont) doc.setFont(cjkFont, 'normal'); y = 12; }
      const batchDates = sortedDates.slice(batch * PAGES_BATCH, (batch + 1) * PAGES_BATCH);
      const isLastBatch = batch === totalDateBatches - 1;
      const dateCols = batchDates.map(d => { const parts = d.split('-'); return `${parseInt(parts[1])}/${parseInt(parts[2])}`; });
      const head = [['類別', '品名', '單價', ...dateCols, ...(isLastBatch ? ['數量', '小計', '總計'] : [])]];
      const bodyData = [];
      for (const [, entry] of products) {
        const row = [entry.warehouse || warehouseDisplay, entry.name, entry.unitPrice.toLocaleString(), ...batchDates.map(d => { const qty = entry.dateQty.get(d); return qty ? String(qty) : ''; })];
        if (isLastBatch) { const subtotal = entry.unitPrice * entry.totalQty; row.push(String(entry.totalQty), subtotal.toLocaleString(), ''); }
        bodyData.push(row);
      }
      if (isLastBatch) grandTotal = products.reduce((s, [, e]) => s + e.totalAmount, 0);
      if (isLastBatch) bodyData.push(['', '', '', ...batchDates.map(() => ''), '', '', `${grandTotal.toLocaleString()}`]);

      const warehouseW = 16, nameW = 32, priceW = 16, dateW = 8, qtyW = 10, subtotalW = 16, totalW = 20;
      const colWidths = [warehouseW, nameW, priceW, ...batchDates.map(() => dateW)];
      if (isLastBatch) colWidths.push(qtyW, subtotalW, totalW);
      const columnStyles = {};
      colWidths.forEach((w, i) => { columnStyles[i] = { cellWidth: w, halign: i >= 3 ? 'center' : (i === 2 ? 'right' : 'left') }; });
      if (isLastBatch) {
        const lastIdx = colWidths.length - 1;
        columnStyles[lastIdx] = { cellWidth: totalW, halign: 'right', fontStyle: 'bold', textColor: [139, 0, 0] };
        columnStyles[lastIdx - 1] = { cellWidth: subtotalW, halign: 'right' };
        columnStyles[lastIdx - 2] = { cellWidth: qtyW, halign: 'center' };
      }
      doc.setTextColor(0, 0, 0);
      doc.autoTable({
        startY: y, head, body: bodyData,
        styles: { fontSize: tableFS, cellPadding: 1.5, lineColor: [160, 160, 160], lineWidth: 0.2, textColor: [0, 0, 0], ...(cjkFont && { font: cjkFont }) },
        headStyles: { fillColor: [220, 210, 180], textColor: [60, 50, 0], fontStyle: 'bold', halign: 'center', fontSize: tableFS, ...(cjkFont && { font: cjkFont }) },
        alternateRowStyles: { fillColor: [252, 250, 245] },
        columnStyles,
        margin: { left: margin, right: margin },
        didParseCell: (data) => { if (isLastBatch && data.row.index === bodyData.length - 1) { data.cell.styles.fillColor = [220, 210, 180]; data.cell.styles.fontStyle = 'bold'; } },
      });
      y = doc.lastAutoTable.finalY + 4;
    }

    // ===== Price notes =====
    if (priceNoteItems.length > 0) {
      const pageHeight2 = doc.internal.pageSize.getHeight();
      if (y + 40 > pageHeight2 - 15) { doc.addPage(); if (cjkFont) doc.setFont(cjkFont, 'normal'); y = 12; }
      y += 4;
      doc.setDrawColor(204, 204, 204);
      doc.setLineWidth(0.5);
      doc.rect(margin, y, contentWidth, 8 + priceNoteItems.length * 6 + 8, 'S');
      y += 5;
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(102, 102, 102);
      doc.text('參考：下列品項歷史採購曾有較低單價（近 3 筆同廠商紀錄）', margin + 3, y);
      y += 5;
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'bold');
      doc.setFillColor(245, 245, 245);
      doc.rect(margin + 1, y - 3, contentWidth - 2, 5, 'F');
      doc.setTextColor(80, 80, 80);
      const noteColX = [margin + 3, margin + 60, margin + 90, margin + 120, margin + 155];
      ['品名', '本次單價', '歷史最低', '差異', '歷史最低日期'].forEach((h, i) => doc.text(h, noteColX[i], y));
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.setTextColor(68, 68, 68);
      for (const note of priceNoteItems) {
        doc.text(note.productName, noteColX[0], y);
        doc.text(`$${note.currentPrice}`, noteColX[1], y);
        doc.text(`$${note.recentMin}`, noteColX[2], y);
        doc.text(`${note.priceDiff}（${note.diffRate}）`, noteColX[3], y);
        doc.text(note.cheapestDate, noteColX[4], y);
        y += 5;
      }
      y += 3;
      doc.setFontSize(7);
      doc.setFont(undefined, 'italic');
      doc.setTextColor(102, 102, 102);
      doc.text('※ 本附記僅供參考，不影響本次進貨金額。', margin + 3, y);
    }
  }

  // ===== Footer (on all pages) =====
  const finalTotalPages = doc.internal.getNumberOfPages();
  const startPage = doc.internal.getCurrentPageInfo().pageNumber - (finalTotalPages - 1);
  // Only add footer to current page (callers handle multi-page footers if needed)
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

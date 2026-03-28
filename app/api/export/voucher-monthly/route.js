import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/export/voucher-monthly
 * 廠商月度傳票列印 — 傳票表頭 + 品項日期矩陣
 */
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.FINANCE_VIEW, PERMISSIONS.EXPORT_PDF]);
  if (!auth.ok) return auth.response;
  // Additional check: non-admin must have export.pdf specifically
  if (!auth.session.user.permissions?.includes('*')) {
    const perms = auth.session.user.permissions || [];
    if (!perms.includes(PERMISSIONS.EXPORT_PDF)) {
      return createErrorResponse('FORBIDDEN', '需要匯出 PDF 權限', 403);
    }
  }

  try {
    const { searchParams } = new URL(request.url);
    const supplierId = parseInt(searchParams.get('supplierId'));
    const month = searchParams.get('month');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse') || '';
    const showPriceNote = searchParams.get('showPriceNote') !== 'false';

    if (!supplierId || isNaN(supplierId) || (!month && (!startDate || !endDate))) {
      return createErrorResponse('VALIDATION_FAILED', '缺少必要參數 supplierId / month 或 startDate+endDate', 400);
    }

    const makerName = auth.session?.user?.name || auth.session?.user?.email?.split('@')[0] || '未知使用者';

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, phone: true, paymentTerms: true }
    });
    if (!supplier) return createErrorResponse('NOT_FOUND', '廠商不存在', 404);

    // Query purchases — support date range or month
    let monthStart, nextMonth;
    if (startDate && endDate) {
      monthStart = startDate;
      const ed = new Date(endDate);
      ed.setDate(ed.getDate() + 1);
      nextMonth = ed.toISOString().slice(0, 10);
    } else {
      monthStart = `${month}-01`;
      const [year, mon] = month.split('-');
      nextMonth = parseInt(mon) === 12
        ? `${parseInt(year) + 1}-01-01`
        : `${year}-${String(parseInt(mon) + 1).padStart(2, '0')}-01`;
    }

    const whereClause = {
      supplierId,
      purchaseDate: { gte: monthStart, lt: nextMonth },
    };
    if (warehouse) whereClause.warehouse = warehouse;

    const purchases = await prisma.purchaseMaster.findMany({
      where: whereClause,
      take: 5000,
      include: {
        details: { include: { product: { select: { id: true, name: true, unit: true } } } }
      },
      orderBy: { purchaseDate: 'asc' }
    });

    if (purchases.length === 0) {
      return createErrorResponse('VOUCHER_NO_DATA', '指定廠商/月份/館別無進貨資料', 404);
    }

    // Query related invoices (SalesMasters) via SalesDetail.purchaseId
    const purchaseIds = purchases.map(p => p.id);
    const salesDetails = await prisma.salesDetail.findMany({
      where: { purchaseId: { in: purchaseIds } },
      select: { salesId: true },
    });
    const salesIds = [...new Set(salesDetails.map(d => d.salesId))];
    const invoices = salesIds.length > 0
      ? await prisma.salesMaster.findMany({
          where: { id: { in: salesIds } },
          orderBy: { invoiceDate: 'asc' },
        })
      : [];

    // Build dates & product matrix
    const dateSet = new Set(purchases.map(p => p.purchaseDate));
    const sortedDates = Array.from(dateSet).sort();
    const dateColumns = sortedDates.length;
    const orientation = dateColumns >= 15 ? 'landscape' : 'portrait';

    const productMap = new Map();
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

    // Compute price notes — batch fetch all price histories in ONE query
    const priceNoteItems = [];
    if (showPriceNote && productMap.size > 0) {
      const allProductIds = [...productMap.keys()];
      const allHistory = await prisma.priceHistory.findMany({
        where: {
          productId: { in: allProductIds },
          supplierId,
          isSuperseded: false,
          purchaseDate: { lt: monthStart }
        },
        orderBy: { purchaseDate: 'desc' },
        select: { productId: true, unitPrice: true, purchaseDate: true }
      });

      // Group by productId and take top 3 per product
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

    // Aggregate invoice totals
    let invoiceSubtotal = 0;   // 未稅合計
    let invoiceTaxTotal = 0;   // 稅額合計
    let invoiceGrandTotal = 0; // 含稅合計
    if (invoices.length > 0) {
      for (const inv of invoices) {
        invoiceSubtotal += Number(inv.amount || 0);
        invoiceTaxTotal += Number(inv.tax || 0);
        invoiceGrandTotal += Number(inv.totalAmount || 0);
      }
    } else {
      // Fallback: calculate from purchases
      for (const p of purchases) {
        invoiceSubtotal += Number(p.amount || 0);
        invoiceTaxTotal += Number(p.tax || 0);
        invoiceGrandTotal += Number(p.totalAmount || 0);
      }
    }

    // Query related PaymentOrders for this supplier/month
    const paymentOrders = await prisma.paymentOrder.findMany({
      where: {
        supplierId,
        createdAt: { gte: new Date(monthStart), lt: new Date(nextMonth) },
      },
      include: { executions: true },
      orderBy: { createdAt: 'asc' },
    });

    // Fetch account names for payment orders
    const payAcctIds = [...new Set(paymentOrders.map(o => o.accountId).filter(Boolean))];
    const payAccounts = payAcctIds.length > 0
      ? await prisma.cashAccount.findMany({ where: { id: { in: payAcctIds } }, select: { id: true, name: true } })
      : [];
    const payAcctMap = new Map(payAccounts.map(a => [a.id, a.name]));

    // ====== Generate PDF ======
    const jspdfModule = await import('jspdf');
    const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;
    const { applyPlugin } = await import('jspdf-autotable');
    applyPlugin(jsPDF);
    const pdfFontsModule = await import('@/lib/pdf-fonts');
    const addCJKFontToDoc = pdfFontsModule.addCJKFontToDoc || pdfFontsModule.default?.addCJKFontToDoc;
    const getCJKFontFamily = pdfFontsModule.getCJKFontFamily || pdfFontsModule.default?.getCJKFontFamily;

    const isLandscape = orientation === 'landscape';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    addCJKFontToDoc(doc);
    const cjkFont = getCJKFontFamily?.() || undefined;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;
    const warehouseDisplay = warehouse || '全館';
    const tableFS = isLandscape ? 7 : 8;
    const printDate = new Date();
    const printDateStr = `${printDate.getFullYear()}/${printDate.getMonth() + 1}/${printDate.getDate()}`;

    // ============================================================
    // SECTION 1: 傳票表頭
    // ============================================================
    // Title
    doc.setFontSize(isLandscape ? 14 : 18);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text(`${warehouseDisplay}  傳 票`, pageWidth / 2, isLandscape ? 12 : 14, { align: 'center' });

    // Border around entire voucher header
    let y = isLandscape ? 16 : 18;
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.4);

    // ---- Supplier info row ----
    const infoRowH = 7;
    doc.rect(margin, y, contentWidth, infoRowH);
    doc.setFontSize(isLandscape ? 7 : 8.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);

    // Divide into 6 columns
    const infoCols = [
      { w: contentWidth * 0.05, text: String(supplier.id) },
      { w: contentWidth * 0.20, text: supplier.name },
      { w: contentWidth * 0.18, text: supplier.phone || '' },
      { w: contentWidth * 0.15, text: supplier.paymentTerms || '' },
      { w: contentWidth * 0.15, label: '製表日期' },
      { w: contentWidth * 0.27, text: printDateStr },
    ];
    let cx = margin;
    for (let i = 0; i < infoCols.length; i++) {
      const col = infoCols[i];
      if (i > 0) {
        doc.line(cx, y, cx, y + infoRowH);
      }
      const textY = y + infoRowH / 2 + 1.2;
      if (col.label) {
        doc.setFont(undefined, 'bold');
        doc.text(col.label, cx + 2, textY);
      } else {
        doc.setFont(undefined, 'normal');
        doc.text(col.text, cx + 2, textY);
      }
      cx += col.w;
    }
    y += infoRowH;

    // ---- Payment summary table ----
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
    doc.setFontSize(isLandscape ? 6.5 : 7.5);
    cx = margin;
    for (let i = 0; i < payHeaders.length; i++) {
      if (i > 0) doc.line(cx, y, cx, y + payRowH);
      doc.text(payHeaders[i], cx + payColWidths[i] / 2, y + payRowH / 2 + 1, { align: 'center' });
      cx += payColWidths[i];
    }
    y += payRowH;

    // Data rows — fill from PaymentOrders if available, otherwise one empty row
    const payRows = paymentOrders.length > 0
      ? paymentOrders.map(po => {
          const exec = po.executions?.[0];
          return {
            date: exec?.executionDate || (po.createdAt ? new Date(po.createdAt).toISOString().slice(0, 10) : ''),
            account: po.accountId ? (payAcctMap.get(po.accountId) || '') : '',
            check: po.checkNo || '',
            invoiceAmt: Number(po.amount || 0),
            discount: Number(po.discount || 0),
            payAmt: Number(po.netAmount || 0),
            note: po.paymentMethod || '',
          };
        })
      : [{ date: '', account: '', check: '', invoiceAmt: invoiceGrandTotal, discount: 0, payAmt: 0, note: '' }];

    doc.setFont(undefined, 'normal');
    let totalPayAmt = 0;
    let totalDiscount = 0;
    for (const row of payRows) {
      doc.rect(margin, y, contentWidth, payRowH);
      cx = margin;
      const rowValues = [
        row.date,
        row.account,
        row.check,
        row.invoiceAmt ? row.invoiceAmt.toLocaleString() : '',
        row.discount ? row.discount.toLocaleString() : '',
        row.payAmt ? row.payAmt.toLocaleString() : '',
        row.note,
      ];
      for (let i = 0; i < payHeaders.length; i++) {
        if (i > 0) doc.line(cx, y, cx, y + payRowH);
        if (rowValues[i]) {
          const align = (i >= 3 && i <= 5) ? 'right' : 'left';
          const tx = align === 'right' ? cx + payColWidths[i] - 2 : cx + 2;
          doc.text(rowValues[i], tx, y + payRowH / 2 + 1, { align });
        }
        cx += payColWidths[i];
      }
      totalPayAmt += row.payAmt;
      totalDiscount += row.discount;
      y += payRowH;
    }

    // 合計 row
    doc.rect(margin, y, contentWidth, payRowH);
    doc.setFont(undefined, 'bold');
    const totalLabelX = margin + payColWidths[0] + payColWidths[1] + payColWidths[2];
    doc.line(totalLabelX, y, totalLabelX, y + payRowH);
    doc.text('合計', totalLabelX + 2, y + payRowH / 2 + 1);
    // 發票$ total
    const invTotalX = totalLabelX + payColWidths[3] - 2;
    doc.text(invoiceGrandTotal.toLocaleString(), invTotalX, y + payRowH / 2 + 1, { align: 'right' });
    // 折讓 total
    const discX = totalLabelX + payColWidths[3];
    doc.line(discX, y, discX, y + payRowH);
    if (totalDiscount > 0) {
      doc.text(totalDiscount.toLocaleString(), discX + payColWidths[4] - 2, y + payRowH / 2 + 1, { align: 'right' });
    }
    // 付款金額 total
    const payAmtX = discX + payColWidths[4];
    doc.line(payAmtX, y, payAmtX, y + payRowH);
    if (totalPayAmt > 0) {
      doc.text(totalPayAmt.toLocaleString(), payAmtX + payColWidths[5] - 2, y + payRowH / 2 + 1, { align: 'right' });
    }
    // 備註
    const noteX = payAmtX + payColWidths[5];
    doc.line(noteX, y, noteX, y + payRowH);
    y += payRowH;

    // ---- Invoice details section ----
    const maxInvoiceRows = Math.max(invoices.length, 4); // at least 4 rows
    const invRowH = 5.5;
    const invSectionH = maxInvoiceRows * invRowH + 2;
    doc.rect(margin, y, contentWidth, invSectionH);

    doc.setFontSize(isLandscape ? 6.5 : 7.5);
    doc.setFont(undefined, 'normal');

    // Left side: invoice list, Right side: tax breakdown
    const invLeftW = contentWidth * 0.60;
    const invRightW = contentWidth * 0.40;
    doc.line(margin + invLeftW, y, margin + invLeftW, y + invSectionH);

    let invY = y + invRowH - 0.5;
    if (invoices.length > 0) {
      for (const inv of invoices) {
        const invDate = inv.invoiceDate || '';
        const invNo = inv.invoiceNo || '';
        const invAmt = Number(inv.amount || 0);
        doc.setFont(undefined, 'bold');
        doc.text('發票日期', margin + 2, invY);
        doc.setFont(undefined, 'normal');
        const dateX = margin + 20;
        doc.text(invDate, dateX, invY);
        doc.text(invNo, dateX + 28, invY);
        const whAbbr = warehouse ? `${warehouse.charAt(0)}` : '';
        if (whAbbr) doc.text(whAbbr, dateX + 56, invY);
        doc.text(invAmt.toLocaleString(), margin + invLeftW - 3, invY, { align: 'right' });
        invY += invRowH;
      }
    } else {
      // Show purchase data as fallback
      const uniquePurchases = new Map();
      for (const p of purchases) {
        const key = `${p.purchaseDate}-${p.purchaseNo}`;
        if (!uniquePurchases.has(key)) {
          uniquePurchases.set(key, { date: p.purchaseDate, no: p.purchaseNo, amount: Number(p.amount || 0), warehouse: p.warehouse });
        }
      }
      for (const [, p] of uniquePurchases) {
        doc.setFont(undefined, 'bold');
        doc.text('進貨日期', margin + 2, invY);
        doc.setFont(undefined, 'normal');
        doc.text(p.date, margin + 20, invY);
        doc.text(p.no, margin + 48, invY);
        doc.text(Number(p.amount).toLocaleString(), margin + invLeftW - 3, invY, { align: 'right' });
        invY += invRowH;
      }
    }

    // Right side: tax breakdown
    let taxY = y + invRowH - 0.5;
    const taxLabelX = margin + invLeftW + 3;
    const taxValueX = margin + contentWidth - 3;

    doc.setFont(undefined, 'bold');
    doc.text('含稅', taxLabelX, taxY);
    doc.text(`稅: ${invoiceTaxTotal.toLocaleString()}`, taxLabelX + 20, taxY);
    doc.setFont(undefined, 'normal');
    doc.text(`$ ${invoiceGrandTotal.toLocaleString()}`, taxValueX, taxY, { align: 'right' });
    taxY += invRowH;
    doc.text(`稅:`, taxLabelX, taxY);
    doc.text('$', taxValueX, taxY, { align: 'right' });
    taxY += invRowH;
    doc.text(`稅:`, taxLabelX, taxY);
    doc.text('$', taxValueX, taxY, { align: 'right' });
    y += invSectionH;

    // ---- Totals row ----
    const totRowH = 6;
    doc.rect(margin, y, contentWidth, totRowH);
    doc.line(margin + contentWidth / 2, y, margin + contentWidth / 2, y + totRowH);
    doc.setFontSize(isLandscape ? 7 : 8);
    doc.setFont(undefined, 'bold');
    doc.text(`總小計: ${invoiceSubtotal.toLocaleString()}`, margin + contentWidth / 4, y + totRowH / 2 + 1, { align: 'center' });
    doc.text(`總發票金額 ${invoiceGrandTotal.toLocaleString()}`, margin + contentWidth * 3 / 4, y + totRowH / 2 + 1, { align: 'center' });
    y += totRowH;

    // ---- Signature row ----
    const sigRowH = 7;
    doc.rect(margin, y, contentWidth, sigRowH);
    doc.setFontSize(isLandscape ? 7 : 8);
    const sigLabels = ['覆核:', '核准:', '會計:', `製表人: ${makerName}`];
    const sigColW = contentWidth / 4;
    for (let i = 0; i < sigLabels.length; i++) {
      if (i > 0) doc.line(margin + i * sigColW, y, margin + i * sigColW, y + sigRowH);
      doc.setFont(undefined, 'normal');
      doc.text(sigLabels[i], margin + i * sigColW + 3, y + sigRowH / 2 + 1);
    }
    y += sigRowH + 6;

    // ============================================================
    // SECTION 2: 品項日期矩陣
    // ============================================================
    const PAGES_BATCH = isLandscape ? 22 : 14;
    const totalDateBatches = Math.ceil(sortedDates.length / PAGES_BATCH);
    let grandTotal = 0;
    const products = Array.from(productMap.entries());

    // Check if we need a new page for the matrix
    if (y + 30 > pageHeight - 15) {
      doc.addPage();
      y = 12;
    }

    // Separator line + title
    doc.setFontSize(isLandscape ? 7 : 8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(80, 80, 80);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentWidth, y);
    y += 4;

    for (let batch = 0; batch < totalDateBatches; batch++) {
      if (batch > 0) {
        doc.addPage();
        y = 12;
        doc.setFontSize(isLandscape ? 7.5 : 9);
        doc.setTextColor(80, 80, 80);
        doc.text(`${warehouseDisplay} 傳票明細（第 ${batch + 1} 頁，日期欄 ${batch * PAGES_BATCH + 1}–${Math.min((batch + 1) * PAGES_BATCH, sortedDates.length)}）`, margin, y);
        y += 5;
      }

      const batchDates = sortedDates.slice(batch * PAGES_BATCH, (batch + 1) * PAGES_BATCH);
      const isLastBatch = batch === totalDateBatches - 1;

      // Date headers as M/D
      const dateCols = batchDates.map(d => {
        const parts = d.split('-');
        return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
      });

      // Column header: 日期 row
      const head = [];
      // First row: empty + empty + empty + "日　期" spanning dates
      // We'll use a simpler approach: just date columns in header
      head.push(['類別', '品名', '單價', ...dateCols, ...(isLastBatch ? ['數量', '小計', '總計'] : [])]);

      const body = [];
      for (const [pid, entry] of products) {
        const row = [
          entry.warehouse || warehouseDisplay,
          entry.name,
          entry.unitPrice.toLocaleString(),
          ...batchDates.map(d => {
            const qty = entry.dateQty.get(d);
            return qty ? String(qty) : '';
          }),
        ];
        if (isLastBatch) {
          const subtotal = entry.unitPrice * entry.totalQty;
          row.push(String(entry.totalQty), subtotal.toLocaleString(), '');
        }
        body.push(row);
      }

      if (isLastBatch) grandTotal = products.reduce((s, [, e]) => s + e.totalAmount, 0);

      if (isLastBatch) {
        const totalRow = ['', '', '', ...batchDates.map(() => ''), '', '', `${grandTotal.toLocaleString()}`];
        body.push(totalRow);
      }

      // Column widths
      const warehouseW = isLandscape ? 14 : 16;
      const nameW = isLandscape ? 24 : 32;
      const priceW = isLandscape ? 13 : 16;
      const dateW = isLandscape ? 8 : 8;
      const qtyW = 10;
      const subtotalW = 16;
      const totalW = isLandscape ? 18 : 20;

      const colWidths = [warehouseW, nameW, priceW, ...batchDates.map(() => dateW)];
      if (isLastBatch) colWidths.push(qtyW, subtotalW, totalW);

      const columnStyles = {};
      colWidths.forEach((w, i) => {
        columnStyles[i] = { cellWidth: w, halign: i >= 3 ? 'center' : (i === 2 ? 'right' : 'left') };
      });
      if (isLastBatch) {
        const lastIdx = colWidths.length - 1;
        columnStyles[lastIdx] = { cellWidth: totalW, halign: 'right', fontStyle: 'bold', textColor: [139, 0, 0] };
        columnStyles[lastIdx - 1] = { cellWidth: subtotalW, halign: 'right' };
        columnStyles[lastIdx - 2] = { cellWidth: qtyW, halign: 'center' };
      }

      doc.setTextColor(0, 0, 0);
      doc.autoTable({
        startY: y,
        head,
        body,
        styles: {
          fontSize: tableFS,
          cellPadding: isLandscape ? 1.2 : 1.5,
          lineColor: [160, 160, 160],
          lineWidth: 0.2,
          textColor: [0, 0, 0],
          ...(cjkFont && { font: cjkFont }),
        },
        headStyles: {
          fillColor: [220, 210, 180],
          textColor: [60, 50, 0],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: tableFS,
          ...(cjkFont && { font: cjkFont }),
        },
        alternateRowStyles: { fillColor: [252, 250, 245] },
        columnStyles,
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
          if (isLastBatch && data.row.index === body.length - 1) {
            data.cell.styles.fillColor = [220, 210, 180];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });

      y = doc.lastAutoTable.finalY + 4;
    }

    // ---- Price notes section ----
    if (showPriceNote && priceNoteItems.length > 0) {
      if (y + 40 > pageHeight - 15) {
        doc.addPage();
        y = 12;
      }
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

    // ---- Page numbers ----
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(180, 180, 180);
      doc.text(`第 ${i} 頁 / 共 ${totalPages} 頁`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }

    // Audit log for export
    auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.DATA_EXPORT || 'data_export',
      targetModule: 'payment-orders',
      note: `匯出月度傳票 PDF: ${supplier.name} ${month} ${warehouseDisplay}`,
    }).catch(() => {}); // fire-and-forget

    const pdfOutput = doc.output('arraybuffer');
    const filename = `voucher-${supplier.name}-${month}-${warehouseDisplay}.pdf`;

    return new NextResponse(pdfOutput, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/export/voucher-monthly
 * spec23 v3: 廠商月度傳票列印
 * 依廠商+月份+館別生成包含品項日期矩陣的傳票 PDF
 * 自動判斷直式(≤14日期欄)或橫式(≥15日期欄)版面
 *
 * Query params:
 *   supplierId: Int
 *   month: YYYY-MM
 *   warehouse: String
 *   showPriceNote: 'true' | 'false' (default true)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = parseInt(searchParams.get('supplierId'));
    const month = searchParams.get('month'); // e.g. '2026-01'
    const warehouse = searchParams.get('warehouse') || '';
    const showPriceNote = searchParams.get('showPriceNote') !== 'false';

    if (!supplierId || isNaN(supplierId) || !month) {
      return createErrorResponse('VALIDATION_FAILED', '缺少必要參數 supplierId / month', 400);
    }

    // Get maker name from session
    const session = await getServerSession(authOptions).catch(() => null);
    const makerName = session?.user?.name || session?.user?.email?.split('@')[0] || '未知使用者';

    // Get supplier info
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { name: true, phone: true, paymentTerms: true }
    });
    if (!supplier) return createErrorResponse('NOT_FOUND', '廠商不存在', 404);

    // Query purchase masters for this supplier + month + warehouse
    const monthStart = `${month}-01`;
    const [year, mon] = month.split('-');
    const nextMonth = parseInt(mon) === 12
      ? `${parseInt(year) + 1}-01-01`
      : `${year}-${String(parseInt(mon) + 1).padStart(2, '0')}-01`;

    const whereClause = {
      supplierId,
      purchaseDate: { gte: monthStart, lt: nextMonth },
    };
    if (warehouse) whereClause.warehouse = warehouse;

    const purchases = await prisma.purchaseMaster.findMany({
      where: whereClause,
      include: {
        details: { include: { product: { select: { id: true, name: true, unit: true } } } }
      },
      orderBy: { purchaseDate: 'asc' }
    });

    if (purchases.length === 0) {
      return createErrorResponse('VOUCHER_NO_DATA', '指定廠商/月份/館別無進貨資料', 404);
    }

    // Build unique sorted dates
    const dateSet = new Set(purchases.map(p => p.purchaseDate));
    const sortedDates = Array.from(dateSet).sort();
    const dateColumns = sortedDates.length;

    // Determine orientation
    const orientation = dateColumns >= 15 ? 'landscape' : 'portrait';

    // Build product × date matrix
    const productMap = new Map(); // productId → { name, unit, unitPrice, dateQty: Map<date, qty>, total }
    for (const purchase of purchases) {
      for (const detail of purchase.details) {
        const pid = detail.productId;
        const pname = detail.product?.name || `Product#${pid}`;
        const punit = detail.product?.unit || '';
        const unitPrice = Number(detail.unitPrice);
        const qty = detail.quantity;
        const date = purchase.purchaseDate;

        if (!productMap.has(pid)) {
          productMap.set(pid, { name: pname, unit: punit, unitPrice, dateQty: new Map(), totalQty: 0, totalAmount: 0 });
        }
        const entry = productMap.get(pid);
        entry.dateQty.set(date, (entry.dateQty.get(date) || 0) + qty);
        entry.totalQty += qty;
        entry.totalAmount += unitPrice * qty;
        // Use the last seen unit price (should be consistent per supplier)
        entry.unitPrice = unitPrice;
      }
    }

    // Compute price notes (spec23 v3: compare against MIN of last 3 PriceHistory records)
    const priceNoteItems = [];
    if (showPriceNote) {
      for (const [pid, entry] of productMap) {
        const recentHistory = await prisma.priceHistory.findMany({
          where: {
            productId: pid,
            supplierId,
            isSuperseded: false,
            // Exclude records from this month to get "prior" history
            purchaseDate: { lt: monthStart }
          },
          orderBy: { purchaseDate: 'desc' },
          take: 3
        });
        if (recentHistory.length === 0) continue;

        const recentMin = Math.min(...recentHistory.map(h => Number(h.unitPrice)));
        const currentPrice = entry.unitPrice;

        if (currentPrice > recentMin) {
          const cheapestRecord = recentHistory.find(h => Number(h.unitPrice) === recentMin);
          const priceDiff = currentPrice - recentMin;
          const diffRate = ((priceDiff / recentMin) * 100).toFixed(1);
          priceNoteItems.push({
            productName: entry.name,
            currentPrice,
            recentMin,
            priceDiff: `+${priceDiff.toFixed(0)}`,
            diffRate: `+${diffRate}%`,
            cheapestDate: cheapestRecord?.purchaseDate || '',
            historyCount: recentHistory.length,
            includesCrossWarehouse: false
          });
        }
      }
    }

    // Generate PDF (spec23: 中文字體 Noto Sans CJK / WenQuanYi 避免亂碼)
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const { addCJKFontToDoc } = require('@/lib/pdf-fonts');

    const isLandscape = orientation === 'landscape';
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4'
    });
    addCJKFontToDoc(doc);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 18;
    const warehouseDisplay = warehouse || '全館';

    // ---- Title ----
    const titleSize = isLandscape ? 16 : 20;
    doc.setFontSize(titleSize);
    doc.setTextColor(80, 64, 0);
    doc.text(`${warehouseDisplay}　　傳　票`, pageWidth / 2, isLandscape ? 12 : 15, { align: 'center' });

    // Gold line
    doc.setDrawColor(200, 169, 81);
    doc.setLineWidth(0.8);
    const lineY = isLandscape ? 15 : 19;
    doc.line(margin, lineY, pageWidth - margin, lineY);

    // ---- Supplier info row ----
    let y = lineY + 5;
    doc.setFontSize(isLandscape ? 7.5 : 9);
    doc.setTextColor(60, 60, 60);

    const infoFields = [
      { label: '廠商', value: supplier.name },
      { label: '電話', value: supplier.phone || '-' },
      { label: '付款條件', value: supplier.paymentTerms || '-' },
      { label: '製表日期', value: new Date().toLocaleDateString('zh-TW') },
      { label: '製表人', value: makerName },
    ];

    const infoWidth = (pageWidth - margin * 2) / infoFields.length;
    infoFields.forEach((field, i) => {
      const x = margin + i * infoWidth;
      doc.setFont(undefined, 'bold');
      doc.text(`${field.label}：`, x, y);
      doc.setFont(undefined, 'normal');
      const labelWidth = doc.getTextWidth(`${field.label}：`);
      doc.text(field.value, x + labelWidth, y);
    });

    // Light background row
    doc.setFillColor(245, 240, 232);
    doc.rect(margin, y - 4, pageWidth - margin * 2, 6, 'F');
    // Redraw text over background
    infoFields.forEach((field, i) => {
      const x = margin + i * infoWidth;
      doc.setFont(undefined, 'bold');
      doc.text(`${field.label}：`, x, y);
      doc.setFont(undefined, 'normal');
      const labelWidth = doc.getTextWidth(`${field.label}：`);
      doc.text(field.value, x + labelWidth, y);
    });

    y += 8;

    // ---- Signature row (compact for landscape) ----
    if (isLandscape) {
      // Compact single line for landscape
      const sigY = y;
      const sigItems = ['覆核', '核准', '會計', `製表人：${makerName}`];
      const sigItemWidth = (pageWidth - margin * 2) / 4;
      sigItems.forEach((label, i) => {
        const x = margin + i * sigItemWidth;
        doc.setFontSize(7);
        doc.setFont(undefined, 'normal');
        doc.text(label, x, sigY);
        if (i < 3) doc.line(x + 10, sigY, x + sigItemWidth - 2, sigY);
      });
      y += 8;
    } else {
      // Portrait: signature box
      const sigBoxY = y;
      doc.setFontSize(8.5);
      doc.text(`覆核：___________    核准：___________    會計：___________    製表人：${makerName}`, margin, sigBoxY);
      y += 8;
    }

    // ---- Build table ----
    const tableFS = isLandscape ? 7 : 8;
    doc.setFontSize(tableFS);

    // Headers: 館別, 品名, 單價, [dates...], 數量, 小計, 總計
    const PAGES_BATCH = isLandscape ? 22 : 14; // max dates per page
    const totalDateBatches = Math.ceil(sortedDates.length / PAGES_BATCH);

    let grandTotal = 0;
    const products = Array.from(productMap.entries());

    for (let batch = 0; batch < totalDateBatches; batch++) {
      if (batch > 0) {
        doc.addPage();
        y = 15;
        doc.setFontSize(isLandscape ? 7.5 : 9);
        doc.text(`${warehouseDisplay} 傳票（第 ${batch + 1} 頁，日期欄 ${batch * PAGES_BATCH + 1}–${Math.min((batch + 1) * PAGES_BATCH, sortedDates.length)}）`, margin, y);
        y += 6;
      }

      const batchDates = sortedDates.slice(batch * PAGES_BATCH, (batch + 1) * PAGES_BATCH);
      const isLastBatch = batch === totalDateBatches - 1;

      // Format dates as M/D for column headers
      const dateCols = batchDates.map(d => {
        const parts = d.split('-');
        return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
      });

      const head = [['館別', '品名', '單價', ...dateCols, ...(isLastBatch ? ['數量', '小計', '總計'] : [])]];
      const body = [];

      let pageBatchTotal = 0;
      for (const [pid, entry] of products) {
        const row = [
          warehouseDisplay,
          entry.name,
          entry.unitPrice.toLocaleString(),
          ...batchDates.map(d => {
            const qty = entry.dateQty.get(d);
            return qty ? String(qty) : '';
          }),
        ];
        if (isLastBatch) {
          const subtotal = entry.unitPrice * entry.totalQty;
          pageBatchTotal += subtotal;
          row.push(String(entry.totalQty), subtotal.toLocaleString(), '');
        }
        body.push(row);
      }

      if (isLastBatch) grandTotal = products.reduce((s, [, e]) => s + e.totalAmount, 0);

      // Grand total row
      if (isLastBatch) {
        const totalRow = ['', '', '合計', ...batchDates.map(() => ''), '', '', `NT$${grandTotal.toLocaleString()}`];
        body.push(totalRow);
      }

      // Column width config
      const fixedCols = isLastBatch ? 6 : 3; // 館別+品名+單價+(數量+小計+總計 if last)
      const availableWidth = pageWidth - margin * 2;
      const warehouseW = isLandscape ? 12 : 15;
      const nameW = isLandscape ? 22 : 35;
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
      // Grand total col
      if (isLastBatch) {
        columnStyles[colWidths.length - 1] = { cellWidth: totalW, halign: 'right', fontStyle: 'bold', textColor: [139, 0, 0] };
      }

      doc.autoTable({
        startY: y,
        head,
        body,
        styles: {
          fontSize: tableFS,
          cellPadding: isLandscape ? 1.2 : 1.5,
          lineColor: [200, 200, 200],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [240, 232, 208],
          textColor: [80, 64, 0],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: tableFS,
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles,
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
          // Style grand total row
          if (data.row.index === body.length - 1 && isLastBatch) {
            data.cell.styles.fillColor = [240, 232, 208];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });

      y = doc.lastAutoTable.finalY + 4;
    }

    // ---- Price notes section (spec23 v3) ----
    if (showPriceNote && priceNoteItems.length > 0) {
      // Check if we need a new page
      if (y + 40 > pageHeight - 15) {
        doc.addPage();
        y = 15;
      }

      y += 4;
      doc.setDrawColor(204, 204, 204);
      doc.setLineWidth(0.5);
      doc.rect(margin, y, pageWidth - margin * 2, 8 + priceNoteItems.length * 6 + 8, 'S');

      y += 5;
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(102, 102, 102);
      doc.text('參考：下列品項歷史採購曾有較低單價（近 3 筆同廠商紀錄）', margin + 3, y);
      y += 5;

      // Table header
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'bold');
      doc.setFillColor(245, 245, 245);
      doc.rect(margin + 1, y - 3, pageWidth - margin * 2 - 2, 5, 'F');
      doc.setTextColor(80, 80, 80);
      const noteColX = [margin + 3, margin + 60, margin + 90, margin + 120, margin + 155];
      ['品名', '本次單價', '歷史最低', '差異', '歷史最低日期'].forEach((h, i) => doc.text(h, noteColX[i], y));
      y += 5;

      // Note rows
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

    const pdfOutput = doc.output('arraybuffer');
    const filename = `voucher-${supplier.name}-${month}-${warehouseDisplay}.pdf`;

    return new NextResponse(pdfOutput, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'no-store',
        'X-Voucher-Orientation': orientation,
        'X-Voucher-Date-Columns': String(dateColumns),
        'X-Voucher-Price-Notes': String(priceNoteItems.length),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

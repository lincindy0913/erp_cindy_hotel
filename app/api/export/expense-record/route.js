/**
 * POST /api/export/expense-record
 *
 * 固定費用傳票 PDF — 合併同範本 + 月份的所有費用明細為一頁傳票
 *
 * Body: { recordId: number }
 * 自動尋找同 templateId + expenseMonth 的所有記錄，合併輸出
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.EXPORT_PDF, PERMISSIONS.EXPENSE_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const recordId = parseInt(body.recordId);
    if (isNaN(recordId)) return createErrorResponse('VALIDATION_FAILED', '無效的記錄 ID', 400);

    // ── 1. 取主記錄 ──────────────────────────────────────────────
    const primary = await prisma.commonExpenseRecord.findUnique({
      where: { id: recordId },
      include: {
        template: {
          include: { entryLines: { orderBy: { sortOrder: 'asc' } } },
        },
        entryLines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!primary) return createErrorResponse('NOT_FOUND', '找不到費用記錄', 404);

    // ── 2. 找同範本 + 月份的所有兄弟記錄 ─────────────────────────
    const siblings = await prisma.commonExpenseRecord.findMany({
      where: {
        templateId: primary.templateId,
        expenseMonth: primary.expenseMonth,
        executionType: 'fixed',
        status: { not: '已作廢' },
      },
      include: { entryLines: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });

    // ── 3. 取付款單 ──────────────────────────────────────────────
    const poIds = siblings.map(r => r.paymentOrderId).filter(Boolean);
    const paymentOrders = poIds.length > 0
      ? await prisma.paymentOrder.findMany({ where: { id: { in: poIds } }, include: { executions: true } })
      : [];
    const poMap = new Map(paymentOrders.map(po => [po.id, po]));

    // ── 4. 解析範本分錄的帳戶名稱 ───────────────────────────────
    const templateLines = primary.template?.entryLines || [];
    const templateLineMap = new Map(templateLines.map(l => [l.sortOrder, l]));
    const templateAccountIds = templateLines.map(l => l.accountId).filter(Boolean);
    const templateAccounts = templateAccountIds.length > 0
      ? await prisma.cashAccount.findMany({ where: { id: { in: templateAccountIds } }, select: { id: true, name: true } })
      : [];
    const templateAccountMap = new Map(templateAccounts.map(a => [a.id, a.name]));

    // ── 5. 彙整借方費用明細 (所有兄弟記錄) ──────────────────────
    const allExpenseItems = [];
    const creditLineMap = new Map(); // accountingCode → {code, name, summary}
    let totalDebit = 0;

    for (const rec of siblings) {
      for (const l of rec.entryLines) {
        if (l.entryType === 'debit') {
          const tl = templateLineMap.get(l.sortOrder);
          allExpenseItems.push({
            expenseName:   l.accountingName  || tl?.accountingName  || '',
            accountingCode: l.accountingCode || '',
            supplierName:  tl?.supplierName  || '',
            warehouse:     tl?.warehouse     || rec.warehouse || '',
            paymentMethod: tl?.paymentMethod || rec.paymentMethod || '',
            accountName:   tl?.accountId ? (templateAccountMap.get(tl.accountId) || '') : '',
            advancedBy:    tl?.advancedBy    || '',
            summary:       l.summary         || '',
            amount:        Number(l.amount),
          });
          totalDebit += Number(l.amount);
        } else {
          // 貸方：以科目代號去重
          if (!creditLineMap.has(l.accountingCode)) {
            creditLineMap.set(l.accountingCode, {
              accountingCode: l.accountingCode || '',
              accountingName: l.accountingName || '',
              summary:        l.summary         || '',
            });
          }
        }
      }
    }

    const creditLines = Array.from(creditLineMap.values());
    const makerName   = auth.session?.user?.name || auth.session?.user?.email?.split('@')[0] || '';
    const templateName = primary.template?.name || '';
    const expenseMonth = primary.expenseMonth;
    const poNos = paymentOrders.map(po => po.orderNo).join('  |  ');

    // ── 6. 產生 PDF ──────────────────────────────────────────────
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

    renderExpenseGroupVoucher(doc, {
      templateName, expenseMonth, makerName, totalDebit,
      poNos, expenseItems: allExpenseItems, creditLines, cjkFont,
    });

    const pdfOutput = doc.output('arraybuffer');
    const filename = `expense-voucher-${templateName}-${expenseMonth}.pdf`;
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

// ================================================================
//  PDF 渲染：固定費用合併傳票（一頁）
// ================================================================
function renderExpenseGroupVoucher(doc, opts) {
  const { templateName, expenseMonth, makerName, totalDebit, poNos, expenseItems, creditLines, cjkFont } = opts;

  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin     = 12;
  const cw         = pageWidth - margin * 2;

  const printDate    = new Date();
  const printDateStr = `${printDate.getFullYear()}/${printDate.getMonth() + 1}/${printDate.getDate()}`;

  // ── 標題 ──────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('固定費用 傳票', pageWidth / 2, 13, { align: 'center' });

  let y = 17;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);

  // ── 表頭資訊列 ────────────────────────────────────────────────
  const headerH = 8;
  doc.rect(margin, y, cw, headerH);
  const hCols = [
    { w: cw * 0.32, label: '費用範本', text: templateName },
    { w: cw * 0.18, label: '費用月份', text: expenseMonth },
    { w: cw * 0.18, label: '製表日期', text: printDateStr },
    { w: cw * 0.14, label: '合計金額', text: totalDebit.toLocaleString() },
    { w: cw * 0.18, label: '製表人',   text: makerName },
  ];
  let cx = margin;
  for (let i = 0; i < hCols.length; i++) {
    const col = hCols[i];
    if (i > 0) doc.line(cx, y, cx, y + headerH);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text(col.label, cx + 2, y + 3);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(String(col.text), cx + 2, y + 6.5);
    cx += col.w;
  }
  y += headerH;

  // ── 付款單號列 ────────────────────────────────────────────────
  if (poNos) {
    const poH = 5.5;
    doc.rect(margin, y, cw, poH);
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`付款單號：${poNos}`, margin + 2, y + poH / 2 + 1);
    doc.setTextColor(0, 0, 0);
    y += poH;
  }

  y += 4;

  // ── 費用明細表（借方）─────────────────────────────────────────
  const itemHead = [['費用名稱', '會計科目', '廠商', '館別', '付款方式', '付款帳戶', '代墊員工', '摘要', '金額']];
  const itemBody = expenseItems.map(item => [
    item.expenseName   || '',
    item.accountingCode|| '',
    item.supplierName  || '',
    item.warehouse     || '',
    item.paymentMethod || '',
    item.accountName   || '',
    item.advancedBy    || '',
    item.summary       || '',
    item.amount ? item.amount.toLocaleString() : '',
  ]);
  const debitTotal = expenseItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  itemBody.push(['', '', '', '', '', '', '', '合計', debitTotal.toLocaleString()]);

  doc.autoTable({
    startY: y,
    head: itemHead,
    body: itemBody,
    styles: {
      fontSize: 7.5, cellPadding: 1.6,
      lineColor: [180, 180, 180], lineWidth: 0.2,
      textColor: [0, 0, 0],
      ...(cjkFont && { font: cjkFont }),
    },
    headStyles: {
      fillColor: [210, 225, 245], textColor: [30, 30, 30],
      fontStyle: 'bold', halign: 'center', fontSize: 7.5,
      ...(cjkFont && { font: cjkFont }),
    },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    columnStyles: {
      0: { cellWidth: 24 },          // 費用名稱
      1: { cellWidth: 15 },          // 會計科目
      2: { cellWidth: 20 },          // 廠商
      3: { cellWidth: 16 },          // 館別
      4: { cellWidth: 16 },          // 付款方式
      5: { cellWidth: 22 },          // 付款帳戶
      6: { cellWidth: 18 },          // 代墊員工
      7: { cellWidth: 'auto' },      // 摘要
      8: { cellWidth: 22, halign: 'right' }, // 金額
    },
    didParseCell: (data) => {
      if (data.row.index === itemBody.length - 1) {
        data.cell.styles.fillColor = [235, 235, 235];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 3;

  // ── 貸方明細表 ────────────────────────────────────────────────
  if (creditLines.length > 0) {
    const creditHead = [['#', '科目代號', '科目名稱', '摘要', '金額']];
    const creditBody = creditLines.map((l, idx) => [
      String(idx + 1),
      l.accountingCode || '',
      l.accountingName || '',
      l.summary        || '',
      totalDebit.toLocaleString(), // 貸方合計 = 借方合計
    ]);
    creditBody.push(['', '', '', '小計', totalDebit.toLocaleString()]);

    doc.autoTable({
      startY: y,
      head: creditHead,
      body: creditBody,
      styles: {
        fontSize: 7.5, cellPadding: 1.6,
        lineColor: [180, 180, 180], lineWidth: 0.2,
        textColor: [0, 0, 0],
        ...(cjkFont && { font: cjkFont }),
      },
      headStyles: {
        fillColor: [225, 245, 215], textColor: [30, 30, 30],
        fontStyle: 'bold', halign: 'center', fontSize: 7.5,
        ...(cjkFont && { font: cjkFont }),
      },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 40 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 28, halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.row.index === creditBody.length - 1) {
          data.cell.styles.fillColor = [235, 235, 235];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 5;
  }

  // ── 簽核欄（固定在底部附近）─────────────────────────────────
  const sigY    = Math.min(Math.max(y, pageHeight - 30), pageHeight - 22);
  const sigRowH = 8;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);
  doc.rect(margin, sigY, cw, sigRowH);
  const sigLabels = ['覆核:', '核准:', '會計:', `製表人: ${makerName}`];
  const sigColW = cw / 4;
  doc.setFontSize(8);
  for (let i = 0; i < sigLabels.length; i++) {
    if (i > 0) doc.line(margin + i * sigColW, sigY, margin + i * sigColW, sigY + sigRowH);
    doc.setFont(undefined, 'normal');
    doc.text(sigLabels[i], margin + i * sigColW + 3, sigY + sigRowH / 2 + 1.5);
  }

  // ── 頁尾 ──────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(180, 180, 180);
  doc.text(
    `列印日期：${printDateStr} ${printDate.toLocaleTimeString('zh-TW')}`,
    pageWidth / 2, pageHeight - 4, { align: 'center' }
  );
}

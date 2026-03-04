'use client';

import ExcelJS from 'exceljs';

// --- Shared color constants ---
const HEADER_COLOR = 'FF2563EB';       // Blue-600
const ALT_ROW_COLOR = 'FFEBF8FF';     // Blue-50
const SUMMARY_BG_COLOR = 'FFFEF3C7';  // Amber-100
const PDF_HEADER_RGB = [37, 99, 235];  // Blue-600
const PDF_ALT_ROW_RGB = [235, 248, 255]; // Blue-50

/**
 * Helper: populate a single worksheet with title, headers, data and summary rows
 */
function populateSheet(sheet, { columns, data, title }) {
  let startRow = 1;

  // Add title row if provided
  if (title) {
    sheet.mergeCells(1, 1, 1, columns.length);
    const titleCell = sheet.getCell('A1');
    titleCell.value = title;
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: 'center' };
    startRow = 3; // Leave a blank row
  }

  // Add header row
  const headerRow = sheet.getRow(startRow);
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_COLOR } };
    cell.alignment = { horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' }
    };
  });

  // Set column widths
  columns.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width || 15;
  });

  // Add data rows
  data.forEach((row, rowIdx) => {
    const dataRow = sheet.getRow(startRow + 1 + rowIdx);
    const isSummary = row._isSummary === true;

    columns.forEach((col, colIdx) => {
      const cell = dataRow.getCell(colIdx + 1);
      let value = row[col.key] ?? '';

      // Format dates as YYYY/MM/DD
      if (col.format === 'date' && value) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          value = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
        }
      }

      // Format amounts as numeric with 2 decimals
      if (col.format === 'amount' && value !== '' && value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          value = num;
          cell.numFmt = '#,##0.00';
        }
      }

      // Format percentage
      if (col.format === 'percent' && value !== '' && value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          value = `${num.toFixed(2)}%`;
        }
      }

      cell.value = value;
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };

      // Summary row: yellow background + bold
      if (isSummary) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUMMARY_BG_COLOR } };
        cell.font = { bold: true };
      }
      // Alternate row colors (even rows, 0-indexed so rowIdx % 2 === 1 = even visually)
      else if (rowIdx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_COLOR } };
      }
    });
  });
}

/**
 * Export data to XLSX (single sheet)
 * @param {Object} options
 * @param {string} options.filename - Filename without extension
 * @param {string} options.sheetName - Sheet name
 * @param {Array} options.columns - Array of { header: string, key: string, width?: number, format?: string }
 * @param {Array} options.data - Array of row objects (use _isSummary: true for summary rows)
 * @param {string} options.title - Optional title row
 */
export async function exportToXlsx({ filename, sheetName, columns, data, title }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '進銷存系統';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName || 'Sheet1');
  populateSheet(sheet, { columns, data, title });

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/**
 * Export data to XLSX with multiple sheets
 * @param {Object} options
 * @param {string} options.filename - Filename without extension
 * @param {Array} options.sheets - Array of { sheetName, columns, data, title }
 */
export async function exportToXlsxMultiSheet({ filename, sheets }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '進銷存系統';
  workbook.created = new Date();

  sheets.forEach(({ sheetName, columns, data, title }) => {
    const sheet = workbook.addWorksheet(sheetName || 'Sheet1');
    populateSheet(sheet, { columns, data, title });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/**
 * Export data to CSV with UTF-8 BOM
 * @param {Object} options
 * @param {string} options.filename - Filename without extension
 * @param {Array} options.columns - Array of { header: string, key: string }
 * @param {Array} options.data - Array of row objects
 */
export function exportToCsv({ filename, columns, data }) {
  const BOM = '\uFEFF';
  const header = columns.map(c => `"${c.header}"`).join(',');
  const rows = data.map(row =>
    columns.map(col => {
      const val = row[col.key] ?? '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')
  );
  const csv = BOM + header + '\n' + rows.join('\n');
  downloadBlob(csv, `${filename}.csv`, 'text/csv;charset=utf-8');
}

/**
 * Export data to PDF
 * @param {Object} options
 * @param {string} options.filename - Filename without extension
 * @param {string} options.title - Optional title
 * @param {Array} options.columns - Array of { header: string, key: string }
 * @param {Array} options.data - Array of row objects
 * @param {string} options.orientation - 'landscape' or 'portrait'
 */
export async function exportToPdf({ filename, title, columns, data, orientation = 'landscape' }) {
  const { default: jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

  // Title
  if (title) {
    doc.setFontSize(16);
    doc.text(title, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
  }

  // Date
  doc.setFontSize(8);
  doc.text(
    `匯出日期: ${new Date().toLocaleDateString('zh-TW')}`,
    doc.internal.pageSize.getWidth() - 15,
    10,
    { align: 'right' }
  );

  // Table
  doc.autoTable({
    startY: title ? 22 : 15,
    head: [columns.map(c => c.header)],
    body: data.map(row => columns.map(col => {
      const val = row[col.key] ?? '';
      // Format amounts and dates for PDF
      if (col.format === 'amount' && val !== '' && val !== null) {
        const num = parseFloat(val);
        if (!isNaN(num)) return num.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      if (col.format === 'date' && val) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
        }
      }
      return String(val);
    })),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PDF_HEADER_RGB, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: PDF_ALT_ROW_RGB },
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    didParseCell: function (hookData) {
      // Highlight summary rows
      if (hookData.section === 'body') {
        const rowData = data[hookData.row.index];
        if (rowData && rowData._isSummary) {
          hookData.cell.styles.fillColor = [254, 243, 199]; // amber-100
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  doc.save(`${filename}.pdf`);
}

/**
 * Helper: trigger a browser file download from blob/string content
 */
function downloadBlob(content, filename, mimeType) {
  const blob = content instanceof ArrayBuffer
    ? new Blob([content], { type: mimeType })
    : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export column configurations for all modules
 * Each module config has: filename (Chinese base name), columns (header/key/width/format)
 */

export const EXPORT_CONFIGS = {
  purchasing: {
    filename: '進貨單',
    columns: [
      { header: '進貨單號', key: 'purchaseNo', width: 18 },
      { header: '進貨日期', key: 'purchaseDate', width: 14, format: 'date' },
      { header: '廠商', key: 'supplierName', width: 20 },
      { header: '館別', key: 'warehouse', width: 10 },
      { header: '品項數', key: 'itemCount', width: 8 },
      { header: '總金額', key: 'totalAmount', width: 14, format: 'amount' },
      { header: '稅額', key: 'tax', width: 12, format: 'amount' },
      { header: '付款條件', key: 'paymentTerms', width: 12 },
      { header: '狀態', key: 'status', width: 10 },
    ],
  },

  sales: {
    filename: '發票紀錄',
    columns: [
      { header: '發票號碼', key: 'invoiceNo', width: 18 },
      { header: '發票日期', key: 'invoiceDate', width: 14, format: 'date' },
      { header: '發票抬頭', key: 'invoiceTitle', width: 20 },
      { header: '廠商', key: 'supplierName', width: 20 },
      { header: '品項數', key: 'itemCount', width: 8 },
      { header: '金額', key: 'amount', width: 14, format: 'amount' },
      { header: '稅額', key: 'taxAmount', width: 12, format: 'amount' },
      { header: '含稅合計', key: 'totalWithTax', width: 14, format: 'amount' },
      { header: '狀態', key: 'status', width: 10 },
    ],
  },

  finance: {
    filename: '付款單',
    columns: [
      { header: '付款單號', key: 'paymentNo', width: 18 },
      { header: '建立日期', key: 'createdAt', width: 14, format: 'date' },
      { header: '廠商', key: 'supplierName', width: 20 },
      { header: '付款方式', key: 'paymentMethod', width: 12 },
      { header: '付款金額', key: 'totalAmount', width: 14, format: 'amount' },
      { header: '包含發票數', key: 'invoiceCount', width: 10 },
      { header: '狀態', key: 'status', width: 10 },
      { header: '備註', key: 'note', width: 20 },
    ],
  },

  cashflow: {
    filename: '現金交易',
    columns: [
      { header: '交易日期', key: 'txDate', width: 14, format: 'date' },
      { header: '帳戶', key: 'accountName', width: 16 },
      { header: '類型', key: 'type', width: 8 },
      { header: '類別', key: 'categoryName', width: 14 },
      { header: '廠商', key: 'supplierName', width: 16 },
      { header: '金額', key: 'amount', width: 14, format: 'amount' },
      { header: '對象', key: 'counterparty', width: 16 },
      { header: '館別', key: 'warehouse', width: 10 },
      { header: '備註', key: 'note', width: 22 },
    ],
  },

  expenses: {
    filename: '費用記錄',
    columns: [
      { header: '記錄編號', key: 'recordNo', width: 16 },
      { header: '執行日期', key: 'executedAt', width: 14, format: 'date' },
      { header: '範本名稱', key: 'templateName', width: 18 },
      { header: '館別', key: 'warehouse', width: 10 },
      { header: '廠商', key: 'supplierName', width: 18 },
      { header: '總金額', key: 'totalAmount', width: 14, format: 'amount' },
      { header: '狀態', key: 'status', width: 10 },
      { header: '執行者', key: 'executedBy', width: 12 },
    ],
  },

  loans: {
    filename: '貸款清單',
    columns: [
      { header: '貸款名稱', key: 'name', width: 20 },
      { header: '銀行', key: 'bank', width: 16 },
      { header: '貸款類型', key: 'loanType', width: 12 },
      { header: '所有權', key: 'ownerType', width: 10 },
      { header: '貸款金額', key: 'loanAmount', width: 16, format: 'amount' },
      { header: '利率(%)', key: 'interestRate', width: 10, format: 'percent' },
      { header: '利率類型', key: 'rateType', width: 10 },
      { header: '還款方式', key: 'repaymentType', width: 12 },
      { header: '餘額', key: 'balance', width: 16, format: 'amount' },
      { header: '狀態', key: 'status', width: 10 },
    ],
  },

  checks: {
    filename: '支票清單',
    columns: [
      { header: '支票號碼', key: 'checkNo', width: 16 },
      { header: '類型', key: 'type', width: 10 },
      { header: '發票日', key: 'issueDate', width: 14, format: 'date' },
      { header: '到期日', key: 'dueDate', width: 14, format: 'date' },
      { header: '金額', key: 'amount', width: 14, format: 'amount' },
      { header: '對象', key: 'counterparty', width: 18 },
      { header: '銀行', key: 'bank', width: 14 },
      { header: '狀態', key: 'status', width: 10 },
    ],
  },

  inventory: {
    filename: '庫存清單',
    columns: [
      { header: '產品代碼', key: 'productCode', width: 14 },
      { header: '產品名稱', key: 'productName', width: 22 },
      { header: '類別', key: 'category', width: 12 },
      { header: '倉庫', key: 'warehouse', width: 12 },
      { header: '庫存數量', key: 'quantity', width: 10 },
      { header: '單位', key: 'unit', width: 8 },
      { header: '成本單價', key: 'costPrice', width: 12, format: 'amount' },
      { header: '庫存金額', key: 'totalValue', width: 14, format: 'amount' },
    ],
  },

  products: {
    filename: '產品主檔',
    columns: [
      { header: '產品代碼', key: 'code', width: 14 },
      { header: '產品名稱', key: 'name', width: 22 },
      { header: '類別', key: 'category', width: 12 },
      { header: '單位', key: 'unit', width: 8 },
      { header: '成本價', key: 'costPrice', width: 12, format: 'amount' },
      { header: '售價/數量', key: 'salesPrice', width: 12, format: 'amount' },
      { header: '列入庫存', key: 'isInStockLabel', width: 10 },
      { header: '倉庫位置', key: 'warehouseLocation', width: 12 },
      { header: '會計科目', key: 'accountingSubject', width: 14 },
    ],
  },

  pmsIncome: {
    filename: 'PMS收入記錄',
    columns: [
      { header: '日期', key: 'date', width: 14, format: 'date' },
      { header: '館別', key: 'warehouse', width: 10 },
      { header: '科目代碼', key: 'accountingCode', width: 12 },
      { header: '科目名稱', key: 'accountingName', width: 16 },
      { header: '借方金額', key: 'debitAmount', width: 14, format: 'amount' },
      { header: '貸方金額', key: 'creditAmount', width: 14, format: 'amount' },
      { header: '摘要', key: 'summary', width: 22 },
    ],
  },

  monthEnd: {
    filename: '月結狀態',
    columns: [
      { header: '年度', key: 'year', width: 8 },
      { header: '月份', key: 'month', width: 8 },
      { header: '狀態', key: 'status', width: 10 },
      { header: '結帳日期', key: 'closedAt', width: 14, format: 'date' },
      { header: '結帳者', key: 'closedBy', width: 12 },
      { header: '備註', key: 'note', width: 22 },
    ],
  },

  auditLog: {
    filename: '稽核日誌',
    columns: [
      { header: '時間', key: 'createdAt', width: 18, format: 'date' },
      { header: '使用者', key: 'userName', width: 14 },
      { header: 'Email', key: 'userEmail', width: 22 },
      { header: '操作', key: 'actionLabel', width: 16 },
      { header: '等級', key: 'levelLabel', width: 8 },
      { header: '模組', key: 'targetModule', width: 14 },
      { header: '記錄編號', key: 'targetRecordNo', width: 16 },
      { header: '備註', key: 'note', width: 22 },
      { header: 'IP', key: 'ipAddress', width: 16 },
    ],
  },

  cashCount: {
    filename: '現金盤點',
    columns: [
      { header: '盤點日期', key: 'countDate', width: 14, format: 'date' },
      { header: '帳戶', key: 'accountName', width: 16 },
      { header: '館別', key: 'warehouse', width: 10 },
      { header: '系統餘額', key: 'systemBalance', width: 14, format: 'amount' },
      { header: '實際餘額', key: 'actualBalance', width: 14, format: 'amount' },
      { header: '差異', key: 'difference', width: 14, format: 'amount' },
      { header: '狀態', key: 'status', width: 10 },
      { header: '盤點人', key: 'countedBy', width: 12 },
      { header: '備註', key: 'note', width: 20 },
    ],
  },

  reconciliation: {
    filename: '對帳紀錄',
    columns: [
      { header: '對帳月份', key: 'reconciliationMonth', width: 12 },
      { header: '帳戶', key: 'accountName', width: 16 },
      { header: '銀行餘額', key: 'bankBalance', width: 14, format: 'amount' },
      { header: '系統餘額', key: 'systemBalance', width: 14, format: 'amount' },
      { header: '差異', key: 'difference', width: 14, format: 'amount' },
      { header: '狀態', key: 'status', width: 10 },
      { header: '對帳日期', key: 'reconciliationDate', width: 14, format: 'date' },
    ],
  },

  rentals: {
    filename: '租屋收入',
    columns: [
      { header: '物件', key: 'propertyName', width: 16 },
      { header: '租戶', key: 'tenantName', width: 16 },
      { header: '收入月份', key: 'incomeMonth', width: 10 },
      { header: '應收金額', key: 'expectedAmount', width: 14, format: 'amount' },
      { header: '實收金額', key: 'actualAmount', width: 14, format: 'amount' },
      { header: '收款日期', key: 'actualDate', width: 14, format: 'date' },
      { header: '收款方式', key: 'paymentMethod', width: 10 },
      { header: '狀態', key: 'status', width: 10 },
    ],
  },

  yearEnd: {
    filename: '年結報告',
    columns: [
      { header: '年度', key: 'year', width: 8 },
      { header: '狀態', key: 'status', width: 10 },
      { header: '結帳日期', key: 'closedAt', width: 14, format: 'date' },
      { header: '結帳者', key: 'closedBy', width: 12 },
      { header: '備註', key: 'note', width: 22 },
    ],
  },

  supplierRisk: {
    filename: '供應商風險分析',
    columns: [
      { header: '供應商', key: 'supplierName', width: 20 },
      { header: '採購金額', key: 'amount', width: 14, format: 'amount' },
      { header: '佔比(%)', key: 'percentage', width: 10 },
      { header: '風險等級', key: 'riskLevel', width: 10 },
    ],
  },
};

/**
 * Generate export filename with timestamp
 * @param {string} baseName - Chinese base name (e.g. '進貨單')
 * @param {string} [period] - Optional period string (e.g. '2026-03')
 * @returns {string} Filename like '進貨單_2026-03_20260303_143052'
 */
export function generateExportFilename(baseName, period) {
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  const parts = [baseName];
  if (period) parts.push(period);
  parts.push(ts);
  return parts.join('_');
}

/**
 * Format export data: apply column format rules to raw data
 * This pre-formats values for CSV/display. XLSX formatting is handled by export.js.
 * @param {Array} data - Array of row objects
 * @param {Array} columns - Column definitions with format property
 * @returns {Array} Formatted data
 */
export function formatExportData(data, columns) {
  return data.map(row => {
    const formatted = { ...row };
    columns.forEach(col => {
      const val = formatted[col.key];
      if (val === null || val === undefined || val === '') return;

      if (col.format === 'date') {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          formatted[col.key] = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
        }
      }
      if (col.format === 'amount') {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          formatted[col.key] = num.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
      }
      if (col.format === 'percent') {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          formatted[col.key] = `${num.toFixed(2)}%`;
        }
      }
    });
    return formatted;
  });
}

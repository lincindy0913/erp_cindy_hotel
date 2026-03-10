import { NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// 已知 PMS 欄位名稱（用於比對 Excel 表頭）
const KNOWN_PMS_HEADERS = [
  '住房收入', '餐飲收入', '其他營業收入', '服務費收入',
  '代收款-稅金', '預收款', '應收帳款', '現金收入', '信用卡收入', '轉帳收入',
  '房間數', '住房率', '平均房價', '營業日期', '日期', '館別', '館別名稱'
];

// 對應到匯入表單的科目（與 DEFAULT_PMS_COLUMNS 一致）
const DEFAULT_MAPPING = [
  { pmsColumnName: '住房收入', entryType: '貸方', accountingCode: '4111', accountingName: '住房收入' },
  { pmsColumnName: '餐飲收入', entryType: '貸方', accountingCode: '4112', accountingName: '餐飲收入' },
  { pmsColumnName: '其他營業收入', entryType: '貸方', accountingCode: '4113', accountingName: '其他營業收入' },
  { pmsColumnName: '服務費收入', entryType: '貸方', accountingCode: '4114', accountingName: '服務費收入' },
  { pmsColumnName: '代收款-稅金', entryType: '貸方', accountingCode: '2171', accountingName: '代收款-稅金' },
  { pmsColumnName: '預收款', entryType: '借方', accountingCode: '2131', accountingName: '預收款' },
  { pmsColumnName: '應收帳款', entryType: '借方', accountingCode: '1131', accountingName: '應收帳款' },
  { pmsColumnName: '現金收入', entryType: '借方', accountingCode: '1111', accountingName: '現金收入' },
  { pmsColumnName: '信用卡收入', entryType: '借方', accountingCode: '1141', accountingName: '信用卡收入' },
  { pmsColumnName: '轉帳收入', entryType: '借方', accountingCode: '1112', accountingName: '銀行轉帳收入' },
];

function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v).replace(/,/g, '').trim();
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function cellValue(cell) {
  if (!cell) return null;
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  return String(v).trim();
}

function normalizeHeader(str) {
  if (!str) return '';
  return String(str).replace(/\s/g, '').trim();
}

/**
 * POST /api/pms-income/parse-excel
 * Body: multipart/form-data with field "file" (Excel file)
 * Returns: { warehouse?, businessDate?, records, roomCount?, occupancyRate?, avgRoomRate?, fileName }
 */
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.PMS_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      return createErrorResponse('VALIDATION_FAILED', '請上傳 Excel 檔案', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return createErrorResponse('PARSE_ERROR', 'Excel 無工作表', 400);
    }

    const rowCount = sheet.rowCount || 0;
    let headerRowIndex = -1;
    let dataRowIndex = -1;
    const colToHeader = new Map(); // col 1-based -> header text

    // 找表頭列：任一列中出現至少兩個已知欄位名
    for (let r = 1; r <= Math.min(rowCount || 30, 30); r++) {
      const row = sheet.getRow(r);
      let matchCount = 0;
      const found = new Map();
      for (let c = 1; c <= (row.cellCount || 20); c++) {
        const val = normalizeHeader(cellValue(row.getCell(c)));
        if (!val) continue;
        for (const known of KNOWN_PMS_HEADERS) {
          if (val === known || val.includes(known) || known.includes(val)) {
            matchCount++;
            found.set(c, val);
            break;
          }
        }
      }
      if (matchCount >= 2) {
        headerRowIndex = r;
        found.forEach((h, c) => colToHeader.set(c, h));
        dataRowIndex = r + 1; // 資料在下一列
        break;
      }
    }

    if (headerRowIndex < 0) {
      return createErrorResponse('PARSE_ERROR', '無法辨識 Excel 表頭（請確認含住房收入、餐飲收入等欄位）', 400);
    }

    const dataRow = sheet.getRow(dataRowIndex);
    const headerRow = sheet.getRow(headerRowIndex);

    // 若資料列為空，嘗試用表頭列當資料列（同一列有標題與數值）
    let useRow = dataRow;
    let checkRow = dataRow;
    for (let c = 1; c <= (headerRow.cellCount || 20); c++) {
      const hv = headerRow.getCell(c).value;
      const dv = dataRow.getCell(c).value;
      if (hv != null && typeof hv === 'number') {
        useRow = headerRow;
        checkRow = headerRow;
        break;
      }
      if (dv != null && (typeof dv === 'number' || (typeof dv === 'string' && /[\d.,]/.test(dv)))) {
        break;
      }
    }

    const getVal = (colIndex) => {
      const cell = useRow.getCell(colIndex);
      const v = cell?.value;
      if (v == null) return null;
      if (typeof v === 'number') return v;
      const s = String(v).replace(/,/g, '').trim();
      const n = parseFloat(s);
      return Number.isNaN(n) ? null : n;
    };
    const getStr = (colIndex) => {
      const cell = useRow.getCell(colIndex);
      const v = cellValue(cell);
      return v || null;
    };

    // 找出「營業日期」「日期」「館別」欄位
    let businessDate = null;
    let warehouse = null;
    for (const [col, header] of colToHeader) {
      const h = normalizeHeader(header);
      if ((h === '營業日期' || h === '日期' || h.includes('日期')) && !businessDate) {
        const raw = getStr(col);
        if (raw) {
          const d = raw.match(/(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})/) || raw.match(/(\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
          if (d) {
            const y = d[1].length === 4 ? d[1] : '20' + d[1];
            businessDate = `${y}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`;
          } else {
            businessDate = raw;
          }
        }
      }
      if ((h === '館別' || h === '館別名稱') && !warehouse) {
        warehouse = getStr(col) || null;
      }
    }

    // 房間數、住房率、平均房價
    let roomCount = null;
    let occupancyRate = null;
    let avgRoomRate = null;
    for (const [col, header] of colToHeader) {
      const h = normalizeHeader(header);
      if (h === '房間數' || h.includes('房間數')) roomCount = getVal(col);
      if (h === '住房率' || h.includes('住房率')) occupancyRate = getVal(col);
      if (h === '平均房價' || h.includes('平均房價') || h === '平均房價') avgRoomRate = getVal(col);
    }

    // 依 DEFAULT_MAPPING 組出 records，從 Excel 對應欄位抓金額
    const records = DEFAULT_MAPPING.map((m) => {
      let amount = null;
      for (const [col, header] of colToHeader) {
        const h = normalizeHeader(header);
        if (h === m.pmsColumnName || h.includes(m.pmsColumnName) || m.pmsColumnName.includes(h)) {
          amount = getVal(col);
          break;
        }
      }
      return {
        ...m,
        amount: amount != null ? String(amount) : ''
      };
    });

    const fileName = file.name || '日營業報表.xlsx';

    return NextResponse.json({
      warehouse: warehouse || null,
      businessDate: businessDate || null,
      records,
      roomCount: roomCount != null ? String(Math.round(roomCount)) : '',
      occupancyRate: occupancyRate != null ? String(occupancyRate) : '',
      avgRoomRate: avgRoomRate != null ? String(Math.round(avgRoomRate)) : '',
      fileName
    });
  } catch (error) {
    console.error('[pms-income/parse-excel]', error);
    return handleApiError(error);
  }
}

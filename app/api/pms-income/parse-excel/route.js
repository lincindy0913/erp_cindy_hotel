import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// 非金額欄位（用於辨識表頭、取營業日期/館別/房間數/住宿人數/早餐人數等）
const META_HEADERS = [
  '營業日期', '日期', '館別', '館別名稱', '房間數', '住房率', '平均房價',
  '住宿人數', '早餐人數', '住宿間數'
];

function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v).replace(/,/g, '').trim();
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function normalizeHeader(str) {
  if (str == null) return '';
  return String(str).replace(/\s/g, '').trim();
}

function cellStr(val) {
  if (val == null) return '';
  if (typeof val === 'object' && val.w !== undefined) return String(val.w).trim();
  return String(val).trim();
}

/**
 * 用 xlsx 讀取 .xls / .xlsx，回傳第一張 sheet 的二維陣列 [row][col]
 */
function readSheetToMatrix(buffer) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellNF: false,
    cellText: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return null;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  return Array.isArray(aoa) ? aoa : null;
}

/**
 * POST /api/pms-income/parse-excel
 * Body: multipart/form-data with field "file" (Excel file, .xls or .xlsx)
 * 依「PMS 科目對應設定」(mapping 分頁) 的規則，自動對應欄位並抓取金額。
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
    const fileName = file.name || '日營業報表.xlsx';

    const matrix = readSheetToMatrix(buffer);
    if (!matrix || matrix.length === 0) {
      return createErrorResponse('PARSE_ERROR', 'Excel 無工作表或為空', 400);
    }

    // 從 DB 讀取 mapping 規則（與 mapping 分頁一致）
    const mappingRules = await prisma.pmsMappingRule.findMany({
      orderBy: [{ entryType: 'asc' }, { sortOrder: 'asc' }],
    });

    const knownHeaders = [
      ...mappingRules.map((r) => r.pmsColumnName),
      ...META_HEADERS,
    ].filter(Boolean);

    let headerRowIndex = -1;
    const colToHeader = new Map(); // col 0-based -> normalized header text

    for (let r = 0; r < Math.min(matrix.length, 30); r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) continue;
      let matchCount = 0;
      const found = new Map();
      for (let c = 0; c < row.length; c++) {
        const raw = row[c];
        const val = normalizeHeader(cellStr(raw));
        if (!val) continue;
        for (const known of knownHeaders) {
          const n = normalizeHeader(known);
          if (val === n || val.includes(n) || n.includes(val)) {
            matchCount++;
            found.set(c, val);
            break;
          }
        }
      }
      if (matchCount >= 2) {
        headerRowIndex = r;
        found.forEach((h, c) => colToHeader.set(c, h));
        break;
      }
    }

    if (headerRowIndex < 0) {
      return createErrorResponse(
        'PARSE_ERROR',
        '無法辨識 Excel 表頭（請確認含住房收入、餐飲收入等欄位，或先在「PMS 科目對應設定」設定欄位名稱）',
        400
      );
    }

    const headerRow = matrix[headerRowIndex];
    let dataRowIndex = headerRowIndex + 1;
    let dataRow = matrix[dataRowIndex];

    // 若下一列為空或不存在，嘗試用表頭列當資料列（同一列有標題與數值）
    if (!dataRow || dataRow.every((c) => c == null || cellStr(c) === '')) {
      dataRow = headerRow;
      dataRowIndex = headerRowIndex;
    } else {
      const hasNumInData = (dataRow || []).some((c) => toNum(c) != null);
      const hasNumInHeader = (headerRow || []).some((c) => toNum(c) != null);
      if (!hasNumInData && hasNumInHeader) {
        dataRow = headerRow;
        dataRowIndex = headerRowIndex;
      }
    }

    const getVal = (colIndex) => {
      const raw = Array.isArray(dataRow) ? dataRow[colIndex] : undefined;
      return toNum(raw);
    };
    const getStr = (colIndex) => {
      const raw = Array.isArray(dataRow) ? dataRow[colIndex] : undefined;
      const s = cellStr(raw);
      return s || null;
    };

    // 營業日期、館別
    let businessDate = null;
    let warehouse = null;
    for (const [col, header] of colToHeader) {
      const h = header;
      if ((h === '營業日期' || h === '日期' || (header && header.includes('日期'))) && !businessDate) {
        const raw = getStr(col);
        if (raw) {
          const d = raw.match(/(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})/) || raw.match(/(\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
          if (d) {
            const y = d[1].length === 4 ? d[1] : '20' + d[1];
            businessDate = `${y}-${String(d[2]).padStart(2, '0')}-${String(d[3]).padStart(2, '0')}`;
          } else {
            businessDate = raw;
          }
        }
      }
      if ((h === '館別' || h === '館別名稱') && !warehouse) {
        warehouse = getStr(col) || null;
      }
    }

    let roomCount = null;
    let occupancyRate = null;
    let avgRoomRate = null;
    let guestCount = null;
    let breakfastCount = null;
    let occupiedRooms = null;
    for (const [col, header] of colToHeader) {
      const h = header;
      if (h && (h === '房間數' || h.includes('房間數'))) roomCount = getVal(col);
      if (h && (h === '住房率' || h.includes('住房率'))) occupancyRate = getVal(col);
      if (h && (h === '平均房價' || h.includes('平均房價'))) avgRoomRate = getVal(col);
      if (h && (h === '住宿人數' || h.includes('住宿人數'))) guestCount = getVal(col);
      if (h && (h === '早餐人數' || h.includes('早餐人數'))) breakfastCount = getVal(col);
      if (h && (h === '住宿間數' || h.includes('住宿間數'))) occupiedRooms = getVal(col);
    }

    // 依 DB mapping 規則組出 records，從 Excel 對應欄位抓金額
    const records = mappingRules.map((rule) => {
      let amount = null;
      for (const [col, header] of colToHeader) {
        const h = header;
        const n = normalizeHeader(rule.pmsColumnName);
        if (h && (h === n || h.includes(n) || n.includes(h))) {
          amount = getVal(col);
          break;
        }
      }
      return {
        pmsColumnName: rule.pmsColumnName,
        entryType: rule.entryType,
        accountingCode: rule.accountingCode,
        accountingName: rule.accountingName,
        amount: amount != null ? String(amount) : '',
      };
    });

    return NextResponse.json({
      warehouse: warehouse || null,
      businessDate: businessDate || null,
      records,
      roomCount: roomCount != null ? String(Math.round(roomCount)) : '',
      occupancyRate: occupancyRate != null ? String(occupancyRate) : '',
      avgRoomRate: avgRoomRate != null ? String(Math.round(avgRoomRate)) : '',
      guestCount: guestCount != null ? String(Math.round(guestCount)) : '',
      breakfastCount: breakfastCount != null ? String(Math.round(breakfastCount)) : '',
      occupiedRooms: occupiedRooms != null ? String(Math.round(occupiedRooms)) : '',
      fileName,
    });
  } catch (error) {
    console.error('[pms-income/parse-excel]', error);
    return handleApiError(error);
  }
}

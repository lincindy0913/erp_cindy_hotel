import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * Hardcoded Excel column → accounting code mapping.
 * Excel columns come from the hotel daily report (日營業報表).
 * Multiple Excel columns mapping to the same code get summed.
 *
 * 收訂金 is in 本日貸方 section but maps to 借方 預收款 (2131).
 */
const EXCEL_TO_ACCOUNTING = [
  // ── 貸方 (Credit) ── from 本日貸方 section
  { excelCol: '住宿金額', section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },
  { excelCol: '月租金額', section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },
  { excelCol: '休息金額', section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },
  { excelCol: '餐飲部',   section: '本日貸方', entryType: '貸方', code: '4112', name: '餐飲收入' },
  { excelCol: '其他收入', section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '延時費',   section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '加床費',   section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '電話費',   section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '傳真費',   section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '精品櫃',   section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '旅遊行程', section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '娛樂收入', section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '娛樂費',   section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '售禮券',   section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '服務費',   section: '本日貸方', entryType: '貸方', code: '4114', name: '服務費收入' },
  // 收訂金 is in 本日貸方 but maps to 借方
  { excelCol: '收訂金',   section: '本日貸方', entryType: '借方', code: '2131', name: '預收款' },

  // ── 借方 (Debit) ── from 本日借方 section
  { excelCol: '現金',     section: '本日借方', entryType: '借方', code: '1111', name: '現金收入' },
  { excelCol: '信用卡',   section: '本日借方', entryType: '借方', code: '1141', name: '信用卡收入' },
  { excelCol: '應收帳款', section: '本日借方', entryType: '借方', code: '1131', name: '應收帳款' },
  { excelCol: '網訂',     section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '電匯',     section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '票據',     section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '匯票',     section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '劃撥',     section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: 'ATM',      section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '禮券',     section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '折讓',     section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '佣金',     section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '其他',     section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '扣抵積點', section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '沖訂金',   section: '本日借方', entryType: '借方', code: '2131', name: '預收款' },
];

const SKIP_COLS = new Set([
  '貸方合計', '借方合計', '營業總額', '營業淨額', '營業額', '本日貸方', '本日借方',
]);


function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v).replace(/,/g, '').replace(/%$/, '').trim();
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function norm(str) {
  if (str == null) return '';
  return String(str).replace(/\s/g, '').trim();
}

function cellStr(val) {
  if (val == null) return '';
  if (typeof val === 'object' && val.w !== undefined) return String(val.w).trim();
  return String(val).trim();
}

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
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false }) || null;
}

/**
 * POST /api/pms-income/parse-excel
 *
 * Parses hotel daily report Excel (日營業報表).
 * Auto-detects sections by scanning column A:
 *   - Date row (YYYY/MM/DD) → 住宿統計 occupancy block
 *   - "本日貸方" → credit headers (row) + values (row+1)
 *   - "本日借方" → debit headers (row) + values (row+1)
 *   - "住房序號" row → master header (for 發票稅額 columns)
 *   - "合計:" row → totals (人數, 發票稅額 sums)
 *   - Ignores: rows starting with numbers, "月累積貸方", "月累積借方"
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

    // Guard against oversized files (20MB max for Excel parsing)
    const MAX_EXCEL_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_EXCEL_SIZE) {
      return createErrorResponse('VALIDATION_FAILED', '檔案大小超過 20MB 上限', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name || '日營業報表.xlsx';

    const matrix = readSheetToMatrix(buffer);
    if (!matrix || matrix.length === 0) {
      return createErrorResponse('PARSE_ERROR', 'Excel 無工作表或為空', 400);
    }

    // ── 1. 營業日期 from filename ──
    let businessDate = null;
    const fnMatch = fileName.match(/(\d{4})(\d{2})(\d{2})/);
    if (fnMatch) businessDate = `${fnMatch[1]}-${fnMatch[2]}-${fnMatch[3]}`;

    // ── 2. Scan all rows to find anchors ──
    let masterHeaderRow = -1;   // "住房序號" row (row 0 typically)
    let creditHeaderRow = -1;   // "本日貸方"
    let debitHeaderRow = -1;    // "本日借方"
    let occupancyAnchorRow = -1; // date anchor (YYYY/MM/DD in col A)
    let totalsRow = -1;         // "合計:" row

    for (let r = 0; r < Math.min(matrix.length, 100); r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) continue;

      // Check col A (C0) for section labels
      const c0 = norm(cellStr(row[0]));
      if (!c0) {
        // Also check other columns for "合計:"
        for (let c = 0; c < Math.min(row.length, 10); c++) {
          const v = norm(cellStr(row[c]));
          if (/^合計/.test(v) && totalsRow < 0) { totalsRow = r; break; }
        }
        continue;
      }

      if (c0 === '住房序號' && masterHeaderRow < 0) masterHeaderRow = r;
      if (/本日貸方/.test(c0) && creditHeaderRow < 0) creditHeaderRow = r;
      if (/本日借方/.test(c0) && debitHeaderRow < 0) debitHeaderRow = r;
      if (/月累積貸方/.test(c0) || /月累積借方/.test(c0)) continue; // ignore
      if (/^合計/.test(c0) && totalsRow < 0) totalsRow = r;

      // Date anchor: YYYY/MM/DD in col A → occupancy stats header row
      if (occupancyAnchorRow < 0) {
        const dateMatch = cellStr(row[0]).match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (dateMatch) {
          occupancyAnchorRow = r;
          if (!businessDate) {
            businessDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;
          }
        }
      }
    }

    // ── 3. 住宿統計 (occupancy block) ──
    // Date row = headers, row+1 = 住宿 data
    let occupancyRate = null;
    let avgRoomRate = null;
    let occupiedRooms = null;

    if (occupancyAnchorRow >= 0) {
      const hRow = matrix[occupancyAnchorRow]; // headers: 間數, 住休率, 平均房價, ...
      const dRow = matrix[occupancyAnchorRow + 1]; // 住宿 row data
      if (Array.isArray(hRow) && Array.isArray(dRow)) {
        for (let c = 0; c < hRow.length; c++) {
          const h = norm(cellStr(hRow[c]));
          if (/間數/.test(h) && occupiedRooms == null) occupiedRooms = toNum(dRow[c]);
          if (/住休率/.test(h) && occupancyRate == null) occupancyRate = toNum(dRow[c]);
          if (/平均房價/.test(h) && avgRoomRate == null) avgRoomRate = toNum(dRow[c]);
        }
      }
    }

    // ── 4. Extract 本日貸方 / 本日借方 columns ──
    const creditCols = new Map(); // normalized header → colIndex
    const debitCols = new Map();
    let creditDataRow = null;
    let debitDataRow = null;

    if (creditHeaderRow >= 0) {
      const hRow = matrix[creditHeaderRow];
      creditDataRow = matrix[creditHeaderRow + 1] || null;
      if (Array.isArray(hRow)) {
        for (let c = 0; c < hRow.length; c++) {
          const val = norm(cellStr(hRow[c]));
          if (val && !SKIP_COLS.has(val)) creditCols.set(val, c);
        }
      }
    }
    if (debitHeaderRow >= 0) {
      const hRow = matrix[debitHeaderRow];
      debitDataRow = matrix[debitHeaderRow + 1] || null;
      if (Array.isArray(hRow)) {
        for (let c = 0; c < hRow.length; c++) {
          const val = norm(cellStr(hRow[c]));
          if (val && !SKIP_COLS.has(val)) debitCols.set(val, c);
        }
      }
    }

    // ── 5. 發票稅額 from 合計 row (master header cols 發票1稅額, 發票2稅額) ──
    let invoiceTaxTotal = null;
    let guestCount = null;

    if (masterHeaderRow >= 0 && totalsRow >= 0) {
      const mhRow = matrix[masterHeaderRow];
      const tRow = matrix[totalsRow];
      if (Array.isArray(mhRow) && Array.isArray(tRow)) {
        let tax1Col = -1, tax2Col = -1, guestCol = -1;
        for (let c = 0; c < mhRow.length; c++) {
          const h = norm(cellStr(mhRow[c]));
          if (/發票1稅額/.test(h)) tax1Col = c;
          if (/發票2稅額/.test(h)) tax2Col = c;
          if (h === '人數') guestCol = c;
        }
        let taxSum = 0;
        if (tax1Col >= 0) { const v = toNum(tRow[tax1Col]); if (v) taxSum += v; }
        if (tax2Col >= 0) { const v = toNum(tRow[tax2Col]); if (v) taxSum += v; }
        if (taxSum > 0) invoiceTaxTotal = taxSum;
        if (guestCol >= 0) guestCount = toNum(tRow[guestCol]);
      }
    }

    // ── 6. 招待 from 本日借方 ──
    let complimentaryAmount = null;
    if (debitCols.has('招待') && debitDataRow) {
      complimentaryAmount = toNum(debitDataRow[debitCols.get('招待')]);
    }

    // ── 7. Build accounting records (aggregate by code+entryType) ──
    const aggregated = new Map();

    const getVal = (section, excelCol) => {
      if (section === '本日貸方' && creditCols.has(excelCol) && creditDataRow) return toNum(creditDataRow[creditCols.get(excelCol)]);
      if (section === '本日借方' && debitCols.has(excelCol) && debitDataRow) return toNum(debitDataRow[debitCols.get(excelCol)]);
      return null;
    };

    for (const m of EXCEL_TO_ACCOUNTING) {
      const val = getVal(m.section, m.excelCol);
      const key = `${m.entryType}|${m.code}`;
      if (aggregated.has(key)) {
        const existing = aggregated.get(key);
        if (val != null) existing.amount = (existing.amount || 0) + val;
      } else {
        aggregated.set(key, {
          pmsColumnName: m.name,
          entryType: m.entryType,
          accountingCode: m.code,
          accountingName: m.name,
          amount: val,
        });
      }
    }

    // Add unmapped columns from 本日貸方 (columns in Excel but not in EXCEL_TO_ACCOUNTING)
    const mappedCreditCols = new Set(EXCEL_TO_ACCOUNTING.filter(m => m.section === '本日貸方').map(m => m.excelCol));
    for (const [colName, colIdx] of creditCols) {
      if (mappedCreditCols.has(colName)) continue;
      const val = creditDataRow ? toNum(creditDataRow[colIdx]) : null;
      aggregated.set(`貸方|unmapped_${colName}`, {
        pmsColumnName: colName, entryType: '貸方',
        accountingCode: '', accountingName: colName, amount: val,
      });
    }

    // Add unmapped columns from 本日借方
    const mappedDebitCols = new Set(EXCEL_TO_ACCOUNTING.filter(m => m.section === '本日借方').map(m => m.excelCol));
    for (const [colName, colIdx] of debitCols) {
      if (mappedDebitCols.has(colName)) continue;
      const val = debitDataRow ? toNum(debitDataRow[colIdx]) : null;
      aggregated.set(`借方|unmapped_${colName}`, {
        pmsColumnName: colName, entryType: '借方',
        accountingCode: '', accountingName: colName, amount: val,
      });
    }

    // Add 發票稅額 → 代收款-稅金 (2171) 貸方
    if (invoiceTaxTotal != null && invoiceTaxTotal > 0) {
      const taxKey = '貸方|2171';
      if (aggregated.has(taxKey)) {
        aggregated.get(taxKey).amount += invoiceTaxTotal;
      } else {
        aggregated.set(taxKey, {
          pmsColumnName: '代收款-稅金',
          entryType: '貸方',
          accountingCode: '2171',
          accountingName: '代收款-稅金',
          amount: invoiceTaxTotal,
        });
      }
    }

    const records = [...aggregated.values()]
      .map(r => ({ ...r, amount: r.amount != null ? String(Math.round(r.amount)) : null }))
      .sort((a, b) => (a.entryType === '貸方' ? -1 : 1) - (b.entryType === '貸方' ? -1 : 1));

    // ── 8. Reference totals from Excel ──
    let creditTotal = null, debitTotal = null, grossRevenue = null, netRevenue = null;
    if (creditHeaderRow >= 0 && creditDataRow) {
      const hRow = matrix[creditHeaderRow];
      if (Array.isArray(hRow)) {
        for (let c = 0; c < hRow.length; c++) {
          const h = norm(cellStr(hRow[c]));
          if (h === '貸方合計') creditTotal = toNum(creditDataRow[c]);
          if (h === '營業總額') grossRevenue = toNum(creditDataRow[c]);
          if (h === '營業淨額') netRevenue = toNum(creditDataRow[c]);
        }
      }
    }
    if (debitHeaderRow >= 0 && debitDataRow) {
      const hRow = matrix[debitHeaderRow];
      if (Array.isArray(hRow)) {
        for (let c = 0; c < hRow.length; c++) {
          if (norm(cellStr(hRow[c])) === '借方合計') debitTotal = toNum(debitDataRow[c]);
        }
      }
    }

    return NextResponse.json({
      warehouse: null,
      businessDate: businessDate || null,
      records,
      sectionMode: creditHeaderRow >= 0 || debitHeaderRow >= 0,
      roomCount: '',
      occupancyRate: occupancyRate != null ? String(occupancyRate) : '',
      avgRoomRate: avgRoomRate != null ? String(Math.round(avgRoomRate)) : '',
      guestCount: guestCount != null ? String(Math.round(guestCount)) : '',
      breakfastCount: '',
      occupiedRooms: occupiedRooms != null ? String(Math.round(occupiedRooms)) : '',
      fileName,
      complimentaryAmount: complimentaryAmount != null ? String(complimentaryAmount) : '',
      excelTotals: {
        creditTotal: creditTotal != null ? String(Math.round(creditTotal)) : null,
        debitTotal: debitTotal != null ? String(Math.round(debitTotal)) : null,
        grossRevenue: grossRevenue != null ? String(Math.round(grossRevenue)) : null,
        netRevenue: netRevenue != null ? String(Math.round(netRevenue)) : null,
        invoiceTax: invoiceTaxTotal != null ? String(Math.round(invoiceTaxTotal)) : null,
      },
    });
  } catch (error) {
    console.error('[pms-income/parse-excel]', error.message || error);
    return handleApiError(error);
  }
}

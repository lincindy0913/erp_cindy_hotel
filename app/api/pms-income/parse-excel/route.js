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
 * Includes aliases for different hotels' column naming conventions.
 *
 * 收訂金 is in 本日貸方 section but maps to 借方 預收款 (2131).
 */
const EXCEL_TO_ACCOUNTING = [
  // ── 貸方 (Credit) ── from 本日貸方 section
  // 住房收入 (4111) — 各飯店欄位名稱不同，全部合計到同一科目
  { excelCol: '住宿金額',     section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },
  { excelCol: '月租金額',     section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },
  { excelCol: '休息金額',     section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },
  { excelCol: '房租收入',     section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },  // 金旭
  { excelCol: '住宿收入',     section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },
  { excelCol: '住宿+延退',    section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },
  { excelCol: '租金收入',       section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },  // 月租類
  { excelCol: '租金收入(管理)', section: '本日貸方', entryType: '貸方', code: '4111', name: '住房收入' },  // 金旭括號變體
  // 餐飲收入 (4112)
  { excelCol: '餐飲部',       section: '本日貸方', entryType: '貸方', code: '4112', name: '餐飲收入' },
  { excelCol: '餐飲收',       section: '本日貸方', entryType: '貸方', code: '4112', name: '餐飲收入' },
  { excelCol: '餐飲收入',     section: '本日貸方', entryType: '貸方', code: '4112', name: '餐飲收入' },
  { excelCol: '早餐收入',     section: '本日貸方', entryType: '貸方', code: '4112', name: '餐飲收入' },  // 金旭
  { excelCol: '早餐',         section: '本日貸方', entryType: '貸方', code: '4112', name: '餐飲收入' },
  { excelCol: '晚餐收入',     section: '本日貸方', entryType: '貸方', code: '4112', name: '餐飲收入' },  // 金旭
  { excelCol: '餐飲其他收入', section: '本日貸方', entryType: '貸方', code: '4112', name: '餐飲收入' },  // 金旭
  // 其他營業收入 (4113)
  { excelCol: '其他收入',     section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '其他收入(管理)', section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' }, // 金旭
  { excelCol: '延時費',       section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '加床費',       section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '加人費',       section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '電話費',       section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '傳真費',       section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '精品櫃',           section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '精品櫃收入',       section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' }, // 金旭
  { excelCol: '精品櫃收入(客務)', section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' }, // 金旭括號變體
  { excelCol: '旅遊行程',         section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '行程收入',         section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' }, // 金旭
  { excelCol: '行程收入(客務)',   section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' }, // 金旭括號變體
  { excelCol: '娛樂收入',     section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '娛樂費',       section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '飲料收入',     section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' }, // 金旭
  { excelCol: '飲料費',       section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '場租收入',     section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' }, // 金旭
  { excelCol: '洗衣費',       section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  { excelCol: '賠償收入',     section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' }, // 金旭
  { excelCol: '售禮券',       section: '本日貸方', entryType: '貸方', code: '4113', name: '其他營業收入' },
  // 服務費 (4114)
  { excelCol: '服務費',       section: '本日貸方', entryType: '貸方', code: '4114', name: '服務費收入' },
  // 銷項稅額 → 代收款-稅金 (2171)，部分飯店在貸方列示
  { excelCol: '銷項稅額',     section: '本日貸方', entryType: '貸方', code: '2171', name: '代收款-稅金' }, // 金旭
  // 未設定科目
  { excelCol: '未設定4207',   section: '本日貸方', entryType: '貸方', code: '4207', name: '未設定4207' },
  { excelCol: '未設定4208',   section: '本日貸方', entryType: '貸方', code: '4208', name: '未設定4208' },
  { excelCol: '其他未設定',   section: '本日貸方', entryType: '貸方', code: '4209', name: '其他未設定' },
  // 收訂金 在貸方區但實質是借方（預收款）
  { excelCol: '收訂金',         section: '本日貸方', entryType: '借方', code: '2131', name: '預收款' },
  { excelCol: '預收訂金(貸方)', section: '本日貸方', entryType: '借方', code: '2131', name: '預收款' }, // 金旭

  // ── 借方 (Debit) ── from 本日借方 section
  // 現金 (1111)
  { excelCol: '現金',           section: '本日借方', entryType: '借方', code: '1111', name: '現金收入' },
  { excelCol: '庫存現金-台幣',  section: '本日借方', entryType: '借方', code: '1111', name: '現金收入' }, // 金旭
  { excelCol: '台幣現金',       section: '本日借方', entryType: '借方', code: '1111', name: '現金收入' },
  { excelCol: '現金收入',       section: '本日借方', entryType: '借方', code: '1111', name: '現金收入' },
  // 信用卡收入 (1141) — 含 OTA 刷卡、現場刷卡、網路刷卡
  { excelCol: '信用卡',         section: '本日借方', entryType: '借方', code: '1141', name: '信用卡收入' },
  { excelCol: '應收帳款-信用卡',section: '本日借方', entryType: '借方', code: '1141', name: '信用卡收入' }, // 金旭
  { excelCol: '網刷',           section: '本日借方', entryType: '借方', code: '1141', name: '信用卡收入' }, // 網路刷卡=信用卡
  { excelCol: '信用卡收入',     section: '本日借方', entryType: '借方', code: '1141', name: '信用卡收入' },
  // 應收帳款 (1131) — 旅行社、沖帳等
  { excelCol: '應收帳款',       section: '本日借方', entryType: '借方', code: '1131', name: '應收帳款' },
  { excelCol: '應收帳款-T/S',   section: '本日借方', entryType: '借方', code: '1131', name: '應收帳款-旅行社' }, // 金旭
  { excelCol: '應收帳款-沖帳',  section: '本日借方', entryType: '借方', code: '1131', name: '應收帳款-沖帳' },   // 金旭
  { excelCol: '應收帳款-其他',  section: '本日借方', entryType: '借方', code: '1131', name: '應收帳款-其他' },   // 金旭
  // OTA 應收帳款 (1141) — OTA 平台代收後再匯款給飯店，性質同信用卡
  { excelCol: '應收帳款-OTA',   section: '本日借方', entryType: '借方', code: '1141', name: 'OTA應收帳款' },     // 金旭
  // 轉帳/匯款/ATM (1112)
  { excelCol: '網訂',           section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '電匯',           section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '票據',           section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '匯票',           section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '劃撥',           section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: 'ATM',            section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '台灣',           section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' }, // 台灣銀行匯款
  { excelCol: '帳號存款4207',   section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' }, // 指定帳戶
  { excelCol: '帳號存款4208',   section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' }, // 指定帳戶
  { excelCol: '其他帳號存款',   section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' }, // 指定帳戶
  // 禮券/住宿卷 (1112)
  { excelCol: '禮券',           section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '禮券收款',       section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '預收住宿卷',     section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },   // 金旭
  { excelCol: '其他',           section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  { excelCol: '扣抵積點',       section: '本日借方', entryType: '借方', code: '1112', name: '轉帳收入' },
  // 折讓 (4901)
  { excelCol: '折讓',           section: '本日借方', entryType: '借方', code: '4901', name: '銷售折讓' },
  // 佣金費用 (6101)
  { excelCol: '佣金',           section: '本日借方', entryType: '借方', code: '6101', name: '佣金費用' },
  // 招待費 (6201)
  { excelCol: '招待',           section: '本日借方', entryType: '借方', code: '6201', name: '招待費' },
  { excelCol: '招待費',         section: '本日借方', entryType: '借方', code: '6201', name: '招待費' },         // 金旭
  // 業務推廣費 (6310) — 金旭特有科目
  { excelCol: '業務推廣費',     section: '本日借方', entryType: '借方', code: '6310', name: '業務推廣費' },     // 金旭
  // 沖訂金/預收訂金 (2131)
  { excelCol: '沖訂金',         section: '本日借方', entryType: '借方', code: '2131', name: '預收款' },
  { excelCol: '預收訂金(借方)', section: '本日借方', entryType: '借方', code: '2131', name: '預收款' },         // 金旭
];

// 銀行帳戶欄模式 — 命中時自動對應到 1112 轉帳收入（借方）
const BANK_COL_PATTERNS = [
  /土銀/, /台銀/, /合庫/, /彰銀/, /一銀/, /華銀/, /兆豐/, /國泰/, /玉山/, /中信/, /富邦/,
  /帳號存款/, /銀行存款/, /銀行匯款/, /存款帳號/,
  /麗格.*分/, /^\d{4}$/, // 末四碼帳號或含分行名
];

const SKIP_COLS = new Set([
  '貸方合計', '借方合計', '營業總額', '營業淨額', '營業額', '本日貸方', '本日借方',
  '2貸方', '1借方', '小計', // 金旭等飯店使用的區段標記
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

/**
 * 從「公司名稱或專案」欄位判斷訂房來源。
 * 優先以 companyName 比對；若無，再看 bookingRef 前綴。
 * 回傳值對應 PmsReservationRecord.source 欄位。
 */
function detectOtaSource(companyName, bookingRef) {
  const c = (companyName || '').toLowerCase();
  const r = (bookingRef  || '').toLowerCase();

  // ── OTA 平台 ──
  if (/agoda/.test(c))                              return 'OTA-Agoda';
  if (/booking\.com|booking com/.test(c))           return 'OTA-Booking';
  if (/expedia/.test(c))                            return 'OTA-Expedia';
  if (/airbnb/.test(c))                             return 'OTA-Airbnb';
  if (/易遊網|eztravel|ez\s*travel/.test(c))        return 'OTA-易遊網';
  if (/momo|富邦媒/.test(c))                        return 'OTA-MOMO';
  if (/klook/.test(c))                              return 'OTA-Klook';
  if (/kkday/.test(c))                              return 'OTA-KKday';
  if (/雄獅|lion\s*travel/.test(c))                 return 'OTA-雄獅';
  if (/可樂旅遊|colla/.test(c))                     return 'OTA-可樂旅遊';
  if (/lifetour|鳳凰/.test(c))                      return 'OTA-鳳凰';
  if (/hotels\.com|hotelscom/.test(c))              return 'OTA-Hotels.com';
  if (/trip\.com|ctrip|攜程/.test(c))               return 'OTA-Trip.com';
  if (/trivago/.test(c))                            return 'OTA-Trivago';
  if (/google\s*hotel|google\s*hotel\s*ads/.test(c)) return 'OTA-Google';

  // ── 旅行社 / 代訂 ──
  if (/旅行社|travel\s*agency|t\/s|ts訂/.test(c))   return 'T/S';
  if (/代訂|代理|代購/.test(c))                      return '代訂中心';

  // ── 月租 / 包棟 ──
  if (/月租|月結|包棟|長住|長期/.test(c))             return '月租';

  // ── 現場 / 自訂 ──
  if (/現場|walk.?in|散客|直客/.test(c))             return '現場';
  if (/官網|直訂|直接訂/.test(c))                    return '官網直訂';
  if (/企業|公司|corporate/.test(c))                 return '企業';

  // ── bookingRef 前綴輔助判斷（companyName 未能識別時）──
  if (/^bj\d/i.test(r))                             return 'OTA-Booking'; // BJ88201280
  if (/agoda/i.test(r))                             return 'OTA-Agoda';

  // 預設：電話訂房
  return '電話';
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

    // ── 5a. Parse individual reservation rows (rows between masterHeader+1 and first section) ──
    const reservationRows = [];
    if (masterHeaderRow >= 0) {
      const mhRow = matrix[masterHeaderRow];
      const headers = Array.isArray(mhRow) ? mhRow.map(v => norm(cellStr(v))) : [];

      // find col indices in master header
      const hIdx = name => headers.indexOf(name) >= 0 ? headers.indexOf(name) : -1;
      const hIdxAny = (...names) => {
        for (const n of names) { const i = hIdx(n); if (i >= 0) return i; }
        return -1;
      };

      // 發票號碼：先精確比對，再用「包含『發票』且不是稅額/日期/2』的欄位做 fallback
      const invoiceNoIdx = (() => {
        const exact = hIdxAny(
          '發票號碼', '發票號', '統一發票號碼', '發票1號', '發票字號',
          '電子發票號碼', '統一發票', '發票編號', '發票1', '發票',
        );
        if (exact >= 0) return exact;
        for (let i = 0; i < headers.length; i++) {
          const h = headers[i];
          if (h.includes('發票') && !h.includes('稅額') && !h.includes('日期') && !h.includes('2')) return i;
        }
        return -1;
      })();

      const colMap = {
        reservationNo:  hIdxAny('住房序號', '序號', '訂單編號'),
        bookingNo:      hIdxAny('訂房序號', '訂單號', '訂單號碼'),
        bookingRef:     hIdxAny('訂房來源編號', '來源訂單編號', '來源單號'),  // NET-XXXX / BJ格式
        roomNo:         hIdxAny('房號', '房間號'),
        roomType:       hIdxAny('住休', '房型', '房間類型', '狀態'),
        guestName:      hIdxAny('姓名', '住客姓名', '客人姓名', '旅客姓名'),
        companyName:    hIdxAny('公司名稱或專案', '來源名稱及專案', '來源名稱', '來源', '公司名稱', '公司'),
        discountName:   hIdxAny('折扣名稱', '優待碼', '折讓名稱', '優惠碼'),
        checkIn:        hIdxAny('遷入日期', '入住日期', '到達日期', '住宿日期', '入住日期時間'),
        checkOut:       hIdxAny('遷出日期', '退房日期', '離開日期', '退房日期時間'),
        roomRate:       hIdxAny('房租', '住宿金額', '房費', '上限定額'),
        serviceFee:     hIdxAny('服務費'),
        cash:           hIdxAny('現金'),
        creditCard:     hIdxAny('信用卡'),
        wireTransfer:   hIdxAny('電匯收款', '電匯', '票據', '轉帳入', 'ATM轉帳', '匯票收款', '劃撥收款', 'ATM收款'),
        commission:     hIdxAny('佣金'),
        discount:       hIdxAny('折讓'),
        complimentary:  hIdxAny('招待'),
        depositIn:      hIdxAny('收訂金'),
        depositOut:     hIdxAny('沖訂金'),
        receivable:     hIdxAny('應收帳', '應收帳款', '賒帳', '賒帳收回'),
        voucher:        hIdxAny('禮券收款', '禮券'),
        totalRevenue:   hIdxAny('營業收入小計', '貸方合計', '住宿合計', '總金額'),
        otherChargesA:  hIdxAny('延時費'),
        otherChargesB:  hIdxAny('加床費'),
        otherChargesC:  hIdxAny('餐飲部'),
        otherChargesD:  hIdxAny('其他收入'),
        otherChargesE:  hIdxAny('旅遊行程'),
        invoiceNo:      invoiceNoIdx,
        note:           hIdxAny('備註'),
      };

      // first boundary: creditHeaderRow, debitHeaderRow, occupancyAnchorRow (pick earliest after masterHeader)
      const boundaries = [creditHeaderRow, debitHeaderRow, occupancyAnchorRow, totalsRow]
        .filter(r => r > masterHeaderRow);
      const endRow = boundaries.length > 0 ? Math.min(...boundaries) : matrix.length;

      for (let r = masterHeaderRow + 1; r < endRow; r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) continue;
        const c0 = norm(cellStr(row[0]));
        const roomTypeVal = colMap.roomType >= 0 ? norm(cellStr(row[colMap.roomType])) : '';
        const c1 = colMap.bookingNo >= 0 ? norm(cellStr(row[colMap.bookingNo])) : '';
        // Rows with empty col A to include:
        //   訂金 rows  — roomType = "訂金"
        //   團體/公帳  — col A empty but col B (訂房序號) has value
        const isDepositRow = !c0 && roomTypeVal === '訂金';
        const isGroupRow   = !c0 && !!c1;
        if (!c0 && !isDepositRow && !isGroupRow) continue;
        // Normal rows: col A must be numeric (住房序號)
        if (c0 && !/^\d+$/.test(c0)) continue;

        const get = idx => (idx >= 0 ? cellStr(row[idx]) : '');
        const getNum = idx => (idx >= 0 ? (toNum(row[idx]) || 0) : 0);
        // Strip timestamp from date fields: "2026/05/01 21:30:28" → "2026-05-01"
        const getDate = idx => {
          const raw = get(idx);
          if (!raw) return '';
          const m = raw.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
          return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : raw.slice(0, 10);
        };

        const otherCharges = getNum(colMap.otherChargesA) + getNum(colMap.otherChargesB) +
                             getNum(colMap.otherChargesC) + getNum(colMap.otherChargesD) +
                             getNum(colMap.otherChargesE);

        const companyRaw = get(colMap.companyName);
        const bookingRef = get(colMap.bookingRef);

        reservationRows.push({
          reservationNo:  get(colMap.reservationNo) || c0 || c1 || (isDepositRow ? `訂金-${r}` : `列${r}`),
          bookingNo:      get(colMap.bookingNo),
          bookingRef:     bookingRef || null,
          roomNo:         get(colMap.roomNo),
          roomType:       get(colMap.roomType),
          guestName:      get(colMap.guestName),
          companyName:    companyRaw,
          source:         detectOtaSource(companyRaw, bookingRef),
          discountName:   get(colMap.discountName),
          checkIn:        getDate(colMap.checkIn),
          checkOut:       getDate(colMap.checkOut),
          roomRate:       getNum(colMap.roomRate),
          serviceFee:     getNum(colMap.serviceFee),
          otherCharges,
          cash:           getNum(colMap.cash),
          creditCard:     getNum(colMap.creditCard),
          wireTransfer:   getNum(colMap.wireTransfer),
          commission:     getNum(colMap.commission),
          discount:       getNum(colMap.discount),
          complimentary:  getNum(colMap.complimentary),
          depositIn:      getNum(colMap.depositIn),
          depositOut:     getNum(colMap.depositOut),
          receivable:     getNum(colMap.receivable),
          voucher:        getNum(colMap.voucher),
          totalRevenue:   getNum(colMap.totalRevenue),
          invoiceNo:      get(colMap.invoiceNo) || null,
          note:           get(colMap.note) || null,
        });
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
      const isBankCol = BANK_COL_PATTERNS.some(pat => pat.test(colName));
      aggregated.set(`借方|unmapped_${colName}`, {
        pmsColumnName: colName, entryType: '借方',
        accountingCode: isBankCol ? '1112' : '',
        accountingName: isBankCol ? '銀行存款' : colName,
        amount: val,
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

    // 回傳 masterHeader 欄位名稱供除錯（前端可 console.log 確認欄位對應）
    const masterHeaders = masterHeaderRow >= 0
      ? (matrix[masterHeaderRow] || []).map((v, i) => ({ col: i, name: norm(cellStr(v)) })).filter(x => x.name)
      : [];

    return NextResponse.json({
      warehouse: null,
      businessDate: businessDate || null,
      records,
      reservationRows,
      sectionMode: creditHeaderRow >= 0 || debitHeaderRow >= 0,
      roomCount: '',
      occupancyRate: occupancyRate != null ? String(occupancyRate) : '',
      avgRoomRate: avgRoomRate != null ? String(Math.round(avgRoomRate)) : '',
      guestCount: guestCount != null ? String(Math.round(guestCount)) : '',
      breakfastCount: '',
      occupiedRooms: occupiedRooms != null ? String(Math.round(occupiedRooms)) : '',
      fileName,
      complimentaryAmount: complimentaryAmount != null ? String(complimentaryAmount) : '',
      _debug: { masterHeaders, invoiceNoColIdx: masterHeaderRow >= 0 ? (() => {
        const h = (matrix[masterHeaderRow] || []).map(v => norm(cellStr(v)));
        const idx = h.findIndex((v, i) => v.includes('發票') && !v.includes('稅額') && !v.includes('2'));
        return { colIdx: idx, colName: idx >= 0 ? h[idx] : null };
      })() : null },
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

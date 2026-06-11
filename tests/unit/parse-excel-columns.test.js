/**
 * Tests for parse-excel 金旭 column mapping and BANK_COL_PATTERNS.
 *
 * Builds a minimal XLSX buffer in memory, calls the POST route handler
 * with mocked auth, and asserts the returned accounting records contain
 * the expected codes.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';

vi.mock('@/lib/api-auth', () => ({
  requireAnyPermission: vi.fn().mockResolvedValue({ ok: true, session: { user: {} } }),
}));

import { POST } from '@/app/api/pms-income/parse-excel/route.js';

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Build a one-sheet XLSX from a 2-D array-of-arrays.
 * Returns a Node Buffer suitable for use in FormData.
 */
function buildXlsx(aoa, filename = '20260501.xlsx') {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Wrap a Buffer in a FormData with the file field the route expects.
 */
function makeRequest(buffer, filename = '20260501.xlsx') {
  const fd = new FormData();
  fd.append(
    'file',
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
  return new Request('http://localhost/api/pms-income/parse-excel', {
    method: 'POST',
    body: fd,
  });
}

// ── fixtures ────────────────────────────────────────────────────────────────

function buildJinxuSheet() {
  // Col A is the section anchor; subsequent columns are field names / values.
  // Row layout expected by the route:
  //   [0] 本日貸方 row  → section label + credit column names
  //   [1] credit values row
  //   [2] 本日借方 row  → section label + debit column names
  //   [3] debit values row
  return buildXlsx([
    // 本日貸方 section — 金旭欄位
    ['本日貸方', '房租收入', '早餐收入', '晚餐收入', '其他收入(管理)', '精品櫃收入', '行程收入', '銷項稅額', '預收訂金(貸方)', '貸方合計'],
    [null,       10000,       2000,       1000,        500,             300,           800,          550,         1000,               16150],
    // 本日借方 section — 金旭欄位
    ['本日借方', '庫存現金-台幣', '應收帳款-信用卡', '應收帳款-T/S', '應收帳款-OTA', '預收訂金(借方)', '招待費', '業務推廣費', '借方合計'],
    [null,        5000,             4000,               3000,          2000,            1000,             500,      200,          15700],
  ]);
}

function buildBankColSheet(bankColName) {
  return buildXlsx([
    ['本日貸方'],
    [null],
    ['本日借方', bankColName],
    [null, 8800],
  ]);
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());

describe('parse-excel 金旭欄位 → accountingCode mapping', () => {
  let records;

  beforeEach(async () => {
    const buf = buildJinxuSheet();
    const res = await POST(makeRequest(buf));
    const body = await res.json();
    records = body.records ?? [];
  });

  const findEntry = (type, code) => records.find(r => r.entryType === type && r.accountingCode === code);

  it('房租收入 → 4111 住房收入', () => {
    expect(findEntry('貸方', '4111')).toBeTruthy();
    expect(Number(findEntry('貸方', '4111').amount)).toBe(10000);
  });

  it('早餐收入 + 晚餐收入 → 4112 餐飲收入（加總）', () => {
    const r = findEntry('貸方', '4112');
    expect(r).toBeTruthy();
    expect(Number(r.amount)).toBe(3000); // 2000 + 1000
  });

  it('其他收入(管理) + 精品櫃收入 + 行程收入 → 4113 其他營業收入', () => {
    const r = findEntry('貸方', '4113');
    expect(r).toBeTruthy();
    expect(Number(r.amount)).toBe(1600); // 500 + 300 + 800
  });

  it('銷項稅額（貸方）→ 2171 代收款-稅金', () => {
    const r = findEntry('貸方', '2171');
    expect(r).toBeTruthy();
    expect(Number(r.amount)).toBe(550);
  });

  it('預收訂金(貸方) → 2131 預收款（借方科目，即使在貸方欄）', () => {
    const r = findEntry('借方', '2131');
    expect(r).toBeTruthy();
    // 預收訂金(貸方) maps to 借方|2131; 預收訂金(借方) also maps to 借方|2131 → summed
    expect(Number(r.amount)).toBe(2000); // 1000 + 1000
  });

  it('庫存現金-台幣 → 1111 現金收入', () => {
    const r = findEntry('借方', '1111');
    expect(r).toBeTruthy();
    expect(Number(r.amount)).toBe(5000);
  });

  it('應收帳款-信用卡 → 1141 信用卡收入', () => {
    const r = findEntry('借方', '1141');
    expect(r).toBeTruthy();
    // 應收帳款-信用卡 (1141) + 應收帳款-OTA (1141) = 4000 + 2000 = 6000
    expect(Number(r.amount)).toBe(6000);
  });

  it('應收帳款-T/S → 1131 應收帳款', () => {
    const r = findEntry('借方', '1131');
    expect(r).toBeTruthy();
    expect(Number(r.amount)).toBe(3000);
  });

  it('招待費 → 6201', () => {
    const r = findEntry('借方', '6201');
    expect(r).toBeTruthy();
    expect(Number(r.amount)).toBe(500);
  });

  it('業務推廣費 → 6310', () => {
    const r = findEntry('借方', '6310');
    expect(r).toBeTruthy();
    expect(Number(r.amount)).toBe(200);
  });
});

describe('parse-excel BANK_COL_PATTERNS (unmapped 借方欄位 自動判為 1112)', () => {
  it.each([
    ['土銀 麗格(分)8890'],
    ['合庫總行'],
    ['台銀帳號'],
    ['麗格(分)8890'],
    ['8890'],  // 4-digit account suffix
    ['銀行存款'],
    ['銀行匯款'],
  ])('%s → accountingCode 1112', async (colName) => {
    const buf = buildBankColSheet(colName);
    const res = await POST(makeRequest(buf));
    const { records } = await res.json();
    const bankEntry = records.find(r => r.pmsColumnName === colName || r.accountingCode === '1112');
    expect(bankEntry).toBeTruthy();
    expect(bankEntry.accountingCode).toBe('1112');
  });

  it('一般未知欄位 → accountingCode 空字串', async () => {
    const buf = buildBankColSheet('未知欄位XYZ');
    const res = await POST(makeRequest(buf));
    const { records } = await res.json();
    const entry = records.find(r => r.pmsColumnName === '未知欄位XYZ');
    expect(entry).toBeTruthy();
    expect(entry.accountingCode).toBe('');
  });
});

describe('parse-excel 格式驗證', () => {
  it('空白 Excel → 400 PARSE_ERROR', async () => {
    const buf = buildXlsx([]);
    const res = await POST(makeRequest(buf));
    expect(res.status).toBe(400);
  });
});

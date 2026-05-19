/**
 * POST /api/reconciliation/credit-card-statements/import-excel
 *
 * 匯入聯合刷卡中心 Excel 對帳單
 * 接受 multipart/form-data:
 *   file      — .xls / .xlsx 檔案
 *   warehouse — 館別（自在海 | 花語）
 *   warehouseId — 館別 ID（選填，有帶則儲存）
 *
 * 聯合刷卡中心常見欄位（不同銀行可能略有差異）：
 *   請款日 / 帳期 / 請款金額 / 調整 / 手續費 / 撥款金額 / 撥款日期
 *   卡別 / 批次 / 筆數 / 手續費率
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

// ── 欄位名稱正規化（去除空白、全形字元）──────────────────────────
const norm = (s) => String(s ?? '').replace(/[\s　　]/g, '').toLowerCase();

// ── 從一行資料中嘗試提取數字 ──────────────────────────────────────
const toNum = (v) => {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
};

// ── 將各種日期格式轉為 YYYY-MM-DD 或 YYYY/MM/DD ─────────────────
function normalizeDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  // Excel serial number
  if (/^\d{5}$/.test(s)) {
    const d = XLSX.SSF.parse_date_code(Number(s));
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  // YYYY/MM/DD or YYYY-MM-DD
  const m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  // 民國年 113/MM/DD
  const roc = s.match(/^(\d{2,3})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (roc) {
    const y = parseInt(roc[1]) + 1911;
    return `${y}-${roc[2].padStart(2,'0')}-${roc[3].padStart(2,'0')}`;
  }
  return s;
}

// ── 卡別正規化 ────────────────────────────────────────────────────
const CARD_TYPE_MAP = {
  visa: 'VISA', v: 'VISA',
  master: 'MASTER', mastercard: 'MASTER', mc: 'MASTER',
  jcb: 'JCB',
  cup: 'CUP', unionpay: 'CUP', '銀聯': 'CUP',
  amex: 'AMEX', americanexpress: 'AMEX',
};
const normalizeCardType = (s) => {
  const k = norm(s);
  return CARD_TYPE_MAP[k] || String(s).toUpperCase();
};

// ── 解析 Excel 主函式 ─────────────────────────────────────────────
function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const result = {
    billingDate:  null,
    paymentDate:  null,
    bankName:     null,
    merchantId:   null,
    merchantName: null,
    accountNo:    null,
    totalCount:   0,
    totalAmount:  0,
    adjustment:   0,
    totalFee:     0,
    serviceFee:   0,
    otherFee:     0,
    netAmount:    0,
    batchLines:   [],
    feeDetails:   [],
    rawNote:      '',
  };

  // ── Pass 1: 掃描 header 區塊（找請款日、撥款日等標籤）──────────
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let ci = 0; ci < row.length; ci++) {
      const lbl = norm(row[ci]);
      const val = row[ci + 1];
      if (!lbl) continue;

      if (!result.billingDate && (lbl.includes('請款日') || lbl.includes('帳期') || lbl.includes('結帳日')))
        result.billingDate = normalizeDate(val) || result.billingDate;
      if (!result.paymentDate && (lbl.includes('撥款日') || lbl.includes('入帳日')))
        result.paymentDate = normalizeDate(val) || result.paymentDate;
      if (!result.bankName && (lbl.includes('收單行') || lbl.includes('銀行名稱') || lbl.includes('銀行')))
        result.bankName = String(val || '').trim() || result.bankName;
      if (!result.merchantId && (lbl.includes('特店代號') || lbl.includes('商店代號') || lbl.includes('特約商店')))
        result.merchantId = String(val || '').trim() || result.merchantId;
      if (!result.merchantName && (lbl.includes('特店名稱') || lbl.includes('商店名稱')))
        result.merchantName = String(val || '').trim() || result.merchantName;
      if (!result.accountNo && (lbl.includes('入帳帳號') || lbl.includes('帳號')))
        result.accountNo = String(val || '').trim() || result.accountNo;

      if (lbl.includes('請款金額') || lbl === '交易金額')
        result.totalAmount = toNum(val) || result.totalAmount;
      if (lbl.includes('調整金額') || lbl === '調整')
        result.adjustment = toNum(val);
      if (lbl.includes('手續費合計') || lbl === '手續費小計')
        result.totalFee = toNum(val) || result.totalFee;
      if (lbl === '手續費' && result.totalFee === 0)
        result.totalFee = toNum(val);
      if (lbl.includes('服務費'))
        result.serviceFee = toNum(val);
      if (lbl.includes('其他費') || lbl.includes('雜費'))
        result.otherFee = toNum(val);
      if (lbl.includes('撥款金額') || lbl.includes('淨額') || lbl.includes('入帳金額'))
        result.netAmount = toNum(val) || result.netAmount;
      if (lbl.includes('筆數合計') || lbl.includes('交易筆數'))
        result.totalCount = parseInt(val) || result.totalCount;
    }
  }

  // ── Pass 2: 尋找表格區塊（找到含卡別/批次/金額欄位的標題列）────
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri].map(norm);
    const hasCardType = row.some(c => c.includes('卡別') || c === 'visa' || c === 'master');
    const hasAmount   = row.some(c => c.includes('金額') || c.includes('amount'));

    if (hasCardType && hasAmount) {
      // 以此行為標頭
      const hdrs = row;
      const idxCard    = hdrs.findIndex(c => c.includes('卡別'));
      const idxCount   = hdrs.findIndex(c => c.includes('筆數') || c.includes('count'));
      const idxAmt     = hdrs.findIndex(c => c.includes('金額') || c.includes('amount'));
      const idxFee     = hdrs.findIndex(c => c === '手續費' || c.includes('fee'));
      const idxRate    = hdrs.findIndex(c => c.includes('費率') || c.includes('rate'));
      const idxBatch   = hdrs.findIndex(c => c.includes('批號') || c.includes('批次'));
      const idxTermin  = hdrs.findIndex(c => c.includes('終端機') || c.includes('機台'));
      const idxSettle  = hdrs.findIndex(c => c.includes('結帳日') || c.includes('交易日'));
      const idxOrigin  = hdrs.findIndex(c => c.includes('類別') || c.includes('國內') || c.includes('origin'));

      for (let di = ri + 1; di < rows.length; di++) {
        const dr = rows[di];
        if (!dr || dr.every(c => c === '')) break; // 空行結束

        const cardType = idxCard >= 0 ? normalizeCardType(dr[idxCard]) : '';
        const amount   = idxAmt  >= 0 ? toNum(dr[idxAmt])  : 0;
        if (!cardType && amount === 0) continue;

        // 判斷是否有批號 → 放 batchLines；否則放 feeDetails
        const batchNo = idxBatch >= 0 ? String(dr[idxBatch] || '').trim() : '';
        if (batchNo || idxTermin >= 0) {
          result.batchLines.push({
            cardType,
            batchNo,
            terminalId:    idxTermin >= 0 ? String(dr[idxTermin] || '').trim() : null,
            settlementDate: idxSettle >= 0 ? normalizeDate(dr[idxSettle]) : null,
            count:  idxCount >= 0 ? parseInt(dr[idxCount]) || 0 : 0,
            amount,
          });
        } else {
          const fee  = idxFee  >= 0 ? toNum(dr[idxFee])  : 0;
          const rate = idxRate >= 0 ? toNum(dr[idxRate]) : null;
          const origin = idxOrigin >= 0 ? String(dr[idxOrigin] || '').trim() : '國內';
          result.feeDetails.push({
            origin,
            cardType,
            count: idxCount >= 0 ? parseInt(dr[idxCount]) || 0 : 0,
            amount,
            fee,
            feeRate: rate,
          });
        }
      }
      break; // 只解析第一個表格區塊
    }
  }

  // ── 推算缺失欄位 ────────────────────────────────────────────────
  if (result.totalFee === 0 && result.feeDetails.length > 0)
    result.totalFee = result.feeDetails.reduce((s, d) => s + d.fee, 0);
  if (result.totalAmount === 0 && result.batchLines.length > 0)
    result.totalAmount = result.batchLines.reduce((s, l) => s + l.amount, 0);
  if (result.totalCount === 0 && result.batchLines.length > 0)
    result.totalCount = result.batchLines.reduce((s, l) => s + (l.count || 0), 0);
  if (result.netAmount === 0 && result.totalAmount > 0)
    result.netAmount = result.totalAmount - result.totalFee - result.serviceFee - result.otherFee + result.adjustment;

  return result;
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const formData = await request.formData();
    const file     = formData.get('file');
    const warehouse     = formData.get('warehouse')    || '';
    const warehouseId   = formData.get('warehouseId')  ? parseInt(formData.get('warehouseId')) : null;
    const previewOnly   = formData.get('preview') === 'true';

    if (!file || typeof file === 'string') {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請上傳 Excel 檔案', 400);
    }
    if (!warehouse) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = parseExcel(buffer);
    } catch (e) {
      return createErrorResponse('PARSE_ERROR', `Excel 解析失敗：${e.message}`, 400);
    }

    if (!parsed.billingDate) {
      return NextResponse.json({
        ok: false,
        warning: '無法自動識別請款日，請確認 Excel 格式或改為手動輸入',
        parsed,
      }, { status: 422 });
    }

    if (previewOnly) {
      return NextResponse.json({ ok: true, preview: true, parsed });
    }

    // 重複檢查
    const existing = await prisma.creditCardStatement.findFirst({
      where: {
        warehouse,
        billingDate: parsed.billingDate,
        ...(parsed.merchantId ? { merchantId: parsed.merchantId } : {}),
      },
    });
    if (existing) {
      return NextResponse.json({
        ok: false, skipped: true,
        message: `此館別 ${warehouse} / 請款日 ${parsed.billingDate} 的對帳單已存在（ID: ${existing.id}）`,
        existingId: existing.id,
      }, { status: 409 });
    }

    // 建立資料
    const stmt = await prisma.$transaction(async (tx) => {
      const s = await tx.creditCardStatement.create({
        data: {
          warehouse,
          warehouseId,
          bankName:     parsed.bankName    || '',
          merchantId:   parsed.merchantId  || null,
          merchantName: parsed.merchantName || null,
          billingDate:  parsed.billingDate,
          paymentDate:  parsed.paymentDate  || null,
          accountNo:    parsed.accountNo    || null,
          totalCount:   parsed.totalCount,
          totalAmount:  parsed.totalAmount,
          adjustment:   parsed.adjustment,
          totalFee:     parsed.totalFee,
          serviceFee:   parsed.serviceFee,
          otherFee:     parsed.otherFee,
          netAmount:    parsed.netAmount,
          status:       'pending',
          importedBy:   auth.session?.user?.name || null,
        },
      });

      if (parsed.batchLines.length > 0) {
        await tx.creditCardBatchLine.createMany({
          data: parsed.batchLines.map(l => ({
            statementId:   s.id,
            billingDate:   parsed.billingDate,
            settlementDate: l.settlementDate || null,
            terminalId:    l.terminalId || null,
            batchNo:       l.batchNo || null,
            cardType:      l.cardType || '',
            count:         l.count,
            amount:        l.amount,
          })),
        });
      }

      if (parsed.feeDetails.length > 0) {
        await tx.creditCardFeeDetail.createMany({
          data: parsed.feeDetails.map(d => ({
            statementId: s.id,
            origin:      d.origin || '國內',
            cardType:    d.cardType || '',
            count:       d.count,
            amount:      d.amount,
            fee:         d.fee,
            feeRate:     d.feeRate,
          })),
        });
      }

      return s;
    });

    return NextResponse.json({ ok: true, id: stmt.id, parsed }, { status: 201 });
  } catch (error) {
    console.error('POST import-excel error:', error);
    return handleApiError(error);
  }
}

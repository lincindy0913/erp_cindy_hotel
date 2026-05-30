/**
 * POST /api/bnb/import
 *
 * 解析雲掌櫃匯出的 Excel/CSV，批次建立 BnbBookingRecord
 *
 * Body: multipart/form-data
 *   file        — .xlsx / .xls / .csv
 *   importMonth — YYYY-MM（指定匯入月份）
 *   warehouse   — 館別（預設「民宿」）
 *   replace     — "true" 則先刪除同月同館的舊資料再匯入
 *   preview     — "true" 只解析回傳前 5 筆＋自動偵測月份，不寫入 DB
 *
 * GET /api/bnb/import?importMonth=YYYY-MM&warehouse=X
 *   回傳該月份現有筆數 { count: N }，供覆蓋前確認用
 *
 * 雲掌櫃欄位（A~H）:
 *   A 來源  B 姓名  C 本期房費  D 本期消費  E 房間
 *   F 入住日期  G （預）離店日期  H 狀態
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertBnbMonthOpen } from '@/lib/bnb-lock';
import { localDateStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

// 解析日期字串 → YYYY-MM-DD
function parseDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // 已是 YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Excel serial date number（UTC 組裝，避免 server 時區差 1 天）
  if (/^\d+$/.test(s)) {
    return new Date((parseInt(s) - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  }
  // YYYY/MM/DD
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return s.slice(0, 10);
}

// ── GET：查現有筆數（覆蓋前確認） ─────────────────────────────────
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_VIEW, PERMISSIONS.BNB_CREATE, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const importMonth = searchParams.get('importMonth');
    const warehouse   = searchParams.get('warehouse') || '民宿';
    if (!importMonth) return NextResponse.json({ count: 0 });
    const count = await prisma.bnbBookingRecord.count({ where: { importMonth, warehouse } });
    return NextResponse.json({ count });
  } catch (e) { return handleApiError(e); }
}

// ── POST：解析 + (preview | 匯入) ────────────────────────────────
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_CREATE, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const formData    = await request.formData();
    const file        = formData.get('file');
    const importMonth = formData.get('importMonth'); // 2026-03
    const warehouse   = formData.get('warehouse') || '民宿';
    const replace     = formData.get('replace') === 'true';
    const preview     = formData.get('preview') === 'true';

    if (!file || !importMonth) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少檔案或匯入月份', 400);
    }
    if (!/^\d{4}-\d{2}$/.test(importMonth)) {
      return createErrorResponse('VALIDATION_FAILED', '月份格式需為 YYYY-MM', 400);
    }

    // preview 模式不檢查月結鎖定
    if (!preview) {
      await assertBnbMonthOpen(importMonth, warehouse);
    }

    const buffer   = Buffer.from(await file.arrayBuffer());
    const fileName = file.name || '';

    // 解析 CSV 或 Excel
    let rows = [];

    if (fileName.toLowerCase().endsWith('.csv')) {
      const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = text.split('\n').filter(l => l.trim());
      rows = lines.slice(1).map(line =>
        line.split(',').map(c => c.replace(/^"|"$/g, '').trim())
      );
    } else {
      const XLSX = await import('xlsx');
      const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: false });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      rows = raw.slice(1).filter(r => r.some(c => String(c).trim()));
    }

    // 欄位對應：A=0 來源, B=1 姓名, C=2 本期房費, D=3 本期消費, E=4 房間, F=5 入住, G=6 離店, H=7 狀態
    const records = rows
      .filter(r => String(r[1] || '').trim())
      .map(r => ({
        importMonth,
        warehouse,
        source:       String(r[0] || '').trim() || '其他',
        guestName:    String(r[1] || '').trim(),
        roomCharge:   parseFloat(String(r[2] || '0').replace(/,/g, '')) || 0,
        otherCharge:  parseFloat(String(r[3] || '0').replace(/,/g, '')) || 0,
        roomNo:       String(r[4] || '').trim() || null,
        checkInDate:  parseDate(r[5]),
        checkOutDate: parseDate(r[6]),
        status:       String(r[7] || '').trim() || '已入住',
      }))
      .filter(r => r.checkInDate && r.checkOutDate);

    if (records.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '找不到有效的訂房資料，請確認欄位格式', 400);
    }

    // 自動偵測月份（取第一筆入住日的年月）
    const detectedMonth = records[0].checkInDate.slice(0, 7);

    // ── preview 模式：只回傳解析結果，不寫入 DB ──
    if (preview) {
      return NextResponse.json({
        preview:        true,
        totalRows:      records.length,
        detectedMonth,
        rows: records.slice(0, 5).map(r => ({
          source:       r.source,
          guestName:    r.guestName,
          roomNo:       r.roomNo,
          checkInDate:  r.checkInDate,
          checkOutDate: r.checkOutDate,
          roomCharge:   r.roomCharge,
          otherCharge:  r.otherCharge,
          status:       r.status,
        })),
      });
    }

    // ── 正式匯入 ──
    // replace 模式：先檢查是否有已對帳／已建帳資料，有則封鎖刪除
    let deleted = 0;
    if (replace) {
      const linked = await prisma.bnbBookingRecord.count({
        where: {
          importMonth, warehouse,
          OR: [
            { paymentLocked: true },
            { depositBankLineId: { not: null } },
            { transferBankLineId: { not: null } },
            { cashBankLineId: { not: null } },
            { cardBankLineId: { not: null } },
            { depositCashTxId: { not: null } },
            { transferCashTxId: { not: null } },
            { cashCashTxId: { not: null } },
            { cardCashTxId: { not: null } },
          ],
        },
      });
      if (linked > 0) {
        return createErrorResponse(
          'REPLACE_BLOCKED',
          `此月份有 ${linked} 筆已對帳或已建帳資料，無法覆蓋匯入。請改用 Append 模式或先解除對帳。`,
          409
        );
      }

      const existingIds = await prisma.bnbBookingRecord.findMany({
        where: { importMonth, warehouse },
        select: { id: true },
      });
      const ids = existingIds.map(r => r.id);
      if (ids.length > 0) {
        const withdrawLinked = await prisma.bnbBossWithdraw.count({
          where: { bookingId: { in: ids } },
        });
        if (withdrawLinked > 0) {
          return createErrorResponse(
            'REPLACE_BLOCKED',
            `此月份有 ${withdrawLinked} 筆老闆收現記錄已關聯訂房，無法覆蓋匯入。`,
            409
          );
        }
      }

      const del = await prisma.bnbBookingRecord.deleteMany({ where: { importMonth, warehouse } });
      deleted = del.count;
    }

    // append 模式：略過重複（以 guestName + checkInDate + checkOutDate + roomNo 比對，跨月全查）
    let skipped = 0;
    let toInsert = records;
    if (!replace) {
      const checkInDates = [...new Set(records.map(r => r.checkInDate))];
      const existing = await prisma.bnbBookingRecord.findMany({
        where: { warehouse, checkInDate: { in: checkInDates } },
        select: { guestName: true, checkInDate: true, checkOutDate: true, roomNo: true },
      });
      const existKeys = new Set(existing.map(r => `${r.guestName}|${r.checkInDate}|${r.checkOutDate}|${r.roomNo ?? ''}`));
      toInsert = records.filter(r => !existKeys.has(`${r.guestName}|${r.checkInDate}|${r.checkOutDate}|${r.roomNo ?? ''}`));
      skipped  = records.length - toInsert.length;
    }

    // 房號重疊檢查（只對有 roomNo 的記錄，含 batch 內互相衝突）
    let conflicts = [];
    const withRoom = toInsert.filter(r => r.roomNo);
    if (withRoom.length > 0) {
      const roomNos = [...new Set(withRoom.map(r => r.roomNo))];
      const minDate = withRoom.reduce((a, r) => r.checkInDate < a ? r.checkInDate : a, withRoom[0].checkInDate);
      const maxDate = withRoom.reduce((a, r) => r.checkOutDate > a ? r.checkOutDate : a, withRoom[0].checkOutDate);
      const existingOverlap = await prisma.bnbBookingRecord.findMany({
        where: {
          warehouse,
          roomNo: { in: roomNos },
          deletedAt: null,
          status: { notIn: ['取消'] },
          checkInDate: { lt: maxDate },
          checkOutDate: { gt: minDate },
        },
        select: { id: true, guestName: true, roomNo: true, checkInDate: true, checkOutDate: true },
      });
      const confirmed = [];
      for (const r of toInsert) {
        if (!r.roomNo) { confirmed.push(r); continue; }
        const blocking = [...existingOverlap, ...confirmed.filter(c => c.roomNo)];
        const hit = blocking.find(e =>
          e.roomNo === r.roomNo &&
          e.checkInDate < r.checkOutDate &&
          e.checkOutDate > r.checkInDate
        );
        if (hit) {
          conflicts.push({
            guestName: r.guestName, roomNo: r.roomNo,
            checkInDate: r.checkInDate, checkOutDate: r.checkOutDate,
            conflictWith: hit.guestName,
          });
        } else {
          confirmed.push(r);
        }
      }
      toInsert = confirmed;
      skipped += conflicts.length;
    }

    if (toInsert.length > 0) {
      await prisma.bnbBookingRecord.createMany({ data: toInsert });
    }

    return NextResponse.json({
      imported: toInsert.length,
      deleted,
      skipped,
      conflicts,
      detectedMonth,
      importMonth,
      warehouse,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

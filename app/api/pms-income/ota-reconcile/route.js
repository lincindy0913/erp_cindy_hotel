/**
 * POST /api/pms-income/ota-reconcile
 *
 * 上傳 OTA 對帳單（Booking.com 等格式），解析後與 PmsIncomeRecord 中
 * 傭金科目（accountingCode=6101 或 pmsColumnName 含「佣金」）做金額比對。
 *
 * Body: multipart/form-data
 *   file      — .xlsx / .xls / .csv
 *   source    — OTA 來源 (Booking | Agoda | Expedia | 其他)
 *   dateFrom  — YYYY-MM-DD（依 Arrival）
 *   dateTo    — YYYY-MM-DD
 *   warehouse — 館別（空字串=全部）
 *
 * Booking.com 欄位:
 *   Reservation number, Arrival, Departure, Booker name, Guest name,
 *   Room nights, Commission %, Original amount, Final amount,
 *   Commission amount, Status
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { todayStr, localDateStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

function parseDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d+$/.test(s)) {
    const d = new Date((parseInt(s) - 25569) * 86400 * 1000);
    return localDateStr(d);
  }
  // YYYY/MM/DD or M/D/YYYY
  const m1 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2,'0')}-${m1[3].padStart(2,'0')}`;
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
  return s.slice(0, 10);
}

function parseNum(v) {
  if (v == null || v === '') return 0;
  return parseFloat(String(v).replace(/,/g, '').replace('%','')) || 0;
}

function parseBookingRows(rows, headerRow) {
  const hMap = {};
  headerRow.forEach((h, i) => { hMap[String(h).trim()] = i; });
  const get = (row, key) => { const idx = hMap[key]; return idx !== undefined ? row[idx] : ''; };

  return rows.map(row => ({
    reservationNo:  String(get(row, 'Reservation number') || '').trim(),
    bookerName:     String(get(row, 'Booker name') || '').trim(),
    guestName:      String(get(row, 'Guest name') || '').trim(),
    arrival:        parseDate(get(row, 'Arrival')),
    departure:      parseDate(get(row, 'Departure')),
    roomNights:     parseNum(get(row, 'Room nights')),
    commissionPct:  parseNum(get(row, 'Commission %')),
    originalAmount: parseNum(get(row, 'Original amount')),
    finalAmount:    parseNum(get(row, 'Final amount')),
    commissionAmt:  parseNum(get(row, 'Commission amount')),
    status:         String(get(row, 'Status') || '').trim(),
    currency:       String(get(row, 'Currency') || 'TWD').trim(),
  })).filter(r => r.arrival && (r.guestName || r.reservationNo));
}

const parseCsvLine = (line) => {
  const fields = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else current += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { fields.push(current.trim()); current = ''; }
      else current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
};

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const formData  = await request.formData();
    const file      = formData.get('file');
    const source    = formData.get('source') || 'Booking';
    const dateFrom  = formData.get('dateFrom') || '';
    const dateTo    = formData.get('dateTo') || '';
    const warehouse = formData.get('warehouse') || '';

    if (!file) return createErrorResponse('REQUIRED_FIELD_MISSING', '請上傳 OTA 對帳單', 400);

    const buffer   = Buffer.from(await file.arrayBuffer());
    const fileName = (file.name || '').toLowerCase();

    // ── 解析 OTA 檔案 ───────────────────────────────────────
    let otaRows = [];
    if (fileName.endsWith('.csv')) {
      const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = text.split('\n').filter(l => l.trim());
      const headerRow = parseCsvLine(lines[0]);
      otaRows = parseBookingRows(lines.slice(1).map(parseCsvLine), headerRow);
    } else {
      const XLSX = await import('xlsx');
      const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: false });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (raw.length < 2) return createErrorResponse('PARSE_ERROR', 'Excel 無資料', 400);
      otaRows = parseBookingRows(raw.slice(1), raw[0]);
    }

    if (otaRows.length === 0) {
      return createErrorResponse('PARSE_ERROR', '未解析到有效的 OTA 資料，請確認欄位格式（需有 Arrival、Guest name 等欄位）', 400);
    }

    // 依日期範圍過濾
    const filtered = otaRows.filter(r => {
      if (dateFrom && r.arrival < dateFrom) return false;
      if (dateTo   && r.arrival > dateTo)   return false;
      return true;
    });

    const allArrivals  = filtered.map(r => r.arrival).filter(Boolean).sort();
    const effectiveFrom = dateFrom || allArrivals[0] || '';
    const effectiveTo   = dateTo   || allArrivals[allArrivals.length - 1] || '';

    // ── 查詢 PMS 傭金記錄 ────────────────────────────────────
    const pmsWhere = {
      AND: [
        effectiveFrom ? { businessDate: { gte: effectiveFrom } } : {},
        effectiveTo   ? { businessDate: { lte: effectiveTo   } } : {},
        warehouse     ? { warehouse } : {},
        {
          OR: [
            { accountingCode: '6101' },
            { pmsColumnName: { contains: '佣金', mode: 'insensitive' } },
            { accountingName: { contains: '佣金', mode: 'insensitive' } },
            { note: { contains: 'OTA', mode: 'insensitive' } },
          ],
        },
      ],
    };

    const pmsRecords = await prisma.pmsIncomeRecord.findMany({
      where: pmsWhere,
      orderBy: [{ businessDate: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        warehouse: true,
        businessDate: true,
        entryType: true,
        pmsColumnName: true,
        amount: true,
        accountingCode: true,
        accountingName: true,
        note: true,
      },
    });

    // ── 統計 ─────────────────────────────────────────────────
    const activeRows     = filtered.filter(r => r.status !== 'CANCELLED');
    const cancelledRows  = filtered.filter(r => r.status === 'CANCELLED');
    const otaRoomTotal   = activeRows.reduce((s, r) => s + r.finalAmount, 0);
    const otaCommTotal   = activeRows.reduce((s, r) => s + r.commissionAmt, 0);
    const pmsCommTotal   = pmsRecords
      .filter(r => r.entryType === '借方')
      .reduce((s, r) => s + Number(r.amount), 0);
    const commDiff       = Math.round((pmsCommTotal - otaCommTotal) * 100) / 100;

    // ── Per-reservation matching + save PmsOtaReconLog/Lines ──
    const billingMonth = effectiveFrom ? effectiveFrom.slice(0, 7) : todayStr().slice(0, 7);

    // Load PMS reservation records for the same date range
    const pmsReservations = warehouse
      ? await prisma.pmsReservationRecord.findMany({
          where: {
            warehouse,
            ...(effectiveFrom ? { businessDate: { gte: effectiveFrom } } : {}),
            ...(effectiveTo   ? { businessDate: { lte: effectiveTo }   } : {}),
          },
          select: { id: true, reservationNo: true, bookingNo: true, guestName: true, checkIn: true, commission: true },
        })
      : [];

    // Build recon lines by matching OTA rows to PMS reservations
    let matchedCount = 0, unmatchedCount = 0, totalDiff = 0;
    const reconLinesData = [];

    for (const otaRow of activeRows) {
      let matched = null;

      // 1. Exact reservationNo match
      if (otaRow.reservationNo) {
        matched = pmsReservations.find(p =>
          (p.reservationNo && p.reservationNo === otaRow.reservationNo) ||
          (p.bookingNo && p.bookingNo === otaRow.reservationNo)
        ) || null;
      }

      // 2. Fuzzy: guestName + arrival date
      if (!matched && otaRow.guestName && otaRow.arrival) {
        const otaNameLower = otaRow.guestName.toLowerCase();
        matched = pmsReservations.find(p => {
          if (!p.guestName) return false;
          const pmsNameLower = p.guestName.toLowerCase();
          const nameMatch = otaNameLower.includes(pmsNameLower) || pmsNameLower.includes(otaNameLower);
          const dateMatch = !p.checkIn || p.checkIn === otaRow.arrival;
          return nameMatch && dateMatch;
        }) || null;
      }

      const pmsCommAmt = matched ? Number(matched.commission) : 0;
      const diff = otaRow.commissionAmt - pmsCommAmt;

      let matchStatus = 'unmatched';
      if (matched) {
        if (Math.abs(diff) <= 1) matchStatus = 'matched';
        else if (matched.guestName?.toLowerCase() !== otaRow.guestName?.toLowerCase()) matchStatus = 'name_diff';
        else matchStatus = 'amount_diff';
      }

      if (matchStatus === 'matched') matchedCount++;
      else unmatchedCount++;
      totalDiff += diff;

      reconLinesData.push({
        reservationId:      matched?.id || null,
        otaReservationNo:   otaRow.reservationNo || null,
        otaGuestName:       otaRow.guestName || null,
        otaArrival:         otaRow.arrival || null,
        otaDeparture:       otaRow.departure || null,
        otaFinalAmount:     otaRow.finalAmount,
        otaCommissionAmt:   otaRow.commissionAmt,
        otaCommissionPct:   otaRow.commissionPct ? otaRow.commissionPct / 100 : null,
        otaStatus:          otaRow.status || null,
        pmsCommissionAmt:   pmsCommAmt,
        matchStatus,
        diffAmount:         Math.round(diff * 100) / 100,
      });
    }

    // Save to DB inside transaction
    const savedLog = await prisma.$transaction(async (tx) => {
      const log = await tx.pmsOtaReconLog.create({
        data: {
          warehouse: warehouse || '全部',
          otaSource: source,
          billingMonth,
          dateFrom: effectiveFrom || null,
          dateTo: effectiveTo || null,
          matchedCount,
          unmatchedCount,
          totalDiff: Math.round(totalDiff * 100) / 100,
        },
      });
      if (reconLinesData.length > 0) {
        await tx.pmsOtaReconLine.createMany({
          data: reconLinesData.map(l => ({ ...l, reconLogId: log.id })),
        });
      }
      return log;
    });

    return NextResponse.json({
      reconLogId: savedLog.id,
      source,
      dateRange: { from: effectiveFrom, to: effectiveTo },
      warehouse: warehouse || '全部',
      otaRowCount:  filtered.length,
      activeCount:  activeRows.length,
      cancelledCount: cancelledRows.length,
      pmsRecordCount: pmsRecords.length,
      matchedCount,
      unmatchedCount,
      summary: {
        otaRoomTotal:  Math.round(otaRoomTotal  * 100) / 100,
        otaCommTotal:  Math.round(otaCommTotal  * 100) / 100,
        pmsCommTotal:  Math.round(pmsCommTotal  * 100) / 100,
        commDiff,
        hasIssue: Math.abs(commDiff) > 1,
      },
      otaRows:    filtered,
      pmsRecords: pmsRecords.map(r => ({ ...r, amount: Number(r.amount) })),
      reconLines: reconLinesData.map((l, i) => ({ ...l, id: i })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

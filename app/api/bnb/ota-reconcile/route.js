/**
 * POST /api/bnb/ota-reconcile
 *
 * 上傳 OTA 對帳單（Booking.com Excel/CSV），
 * 與 BnbBookingRecord 自動比對，回傳比對結果。
 *
 * Body: multipart/form-data
 *   file      — .xlsx / .xls / .csv
 *   source    — OTA 來源 (Booking)
 *   dateFrom  — 比對起始日 YYYY-MM-DD（依 Arrival）
 *   dateTo    — 比對結束日 YYYY-MM-DD
 *   warehouse — 館別（預設民宿）
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

export const dynamic = 'force-dynamic';

function normalizeStr(s) {
  return (s || '').replace(/\s+/g, '').toLowerCase();
}

function namesOverlap(otaName, bnbName) {
  const a = normalizeStr(otaName);
  const b = normalizeStr(bnbName);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;

  const aParts = (otaName || '').split(/[\s,]+/).map(normalizeStr).filter(p => p.length >= 2);
  const bParts = (bnbName || '').split(/[\s,.:：(（]+/).map(normalizeStr).filter(p => p.length >= 2);
  for (const ap of aParts) {
    for (const bp of bParts) {
      if (ap.includes(bp) || bp.includes(ap)) return true;
    }
  }
  return false;
}

function parseDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d+$/.test(s)) {
    const d = new Date((parseInt(s) - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  return s.slice(0, 10);
}

function parseBookingRows(rows, headerRow) {
  const hMap = {};
  headerRow.forEach((h, i) => { hMap[String(h).trim()] = i; });

  const get = (row, key) => {
    const idx = hMap[key];
    return idx !== undefined ? row[idx] : undefined;
  };

  return rows.map(row => {
    const status = String(get(row, 'Status') || '').trim();
    return {
      reservationNo:  String(get(row, 'Reservation number') || ''),
      bookerName:     String(get(row, 'Booker name') || ''),
      guestName:      String(get(row, 'Guest name') || ''),
      arrival:        parseDate(get(row, 'Arrival')),
      departure:      parseDate(get(row, 'Departure')),
      rooms:          parseInt(get(row, 'Rooms')) || 1,
      roomNights:     parseInt(get(row, 'Room nights')) || 0,
      commissionPct:  parseFloat(get(row, 'Commission %')) || 0,
      originalAmount: parseFloat(get(row, 'Original amount')) || 0,
      finalAmount:    parseFloat(get(row, 'Final amount')) || 0,
      commissionAmt:  parseFloat(get(row, 'Commission amount')) || 0,
      status,
      currency:       String(get(row, 'Currency') || 'TWD'),
    };
  }).filter(r => r.arrival && r.guestName);
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_VIEW, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const formData  = await request.formData();
    const file      = formData.get('file');
    const source    = formData.get('source') || 'Booking';
    const dateFrom  = formData.get('dateFrom');
    const dateTo    = formData.get('dateTo');
    const warehouse = formData.get('warehouse') || '民宿';

    if (!file) return createErrorResponse('REQUIRED_FIELD_MISSING', '請上傳 OTA 對帳單', 400);

    const buffer   = Buffer.from(await file.arrayBuffer());
    const fileName = file.name || '';
    let otaRows = [];

    if (fileName.toLowerCase().endsWith('.csv')) {
      const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = text.split('\n').filter(l => l.trim());
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
      const headerRow = parseCsvLine(lines[0]);
      const dataRows = lines.slice(1).map(parseCsvLine);
      otaRows = parseBookingRows(dataRows, headerRow);
    } else {
      const XLSX = await import('xlsx');
      const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: false });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (raw.length < 2) return createErrorResponse('PARSE_ERROR', 'Excel 無資料', 400);
      otaRows = parseBookingRows(raw.slice(1), raw[0]);
    }

    if (otaRows.length === 0) {
      return createErrorResponse('PARSE_ERROR', '未解析到有效的 OTA 資料', 400);
    }

    const allArrivals = otaRows.map(r => r.arrival).filter(Boolean);
    const minDate = dateFrom || allArrivals.sort()[0];
    const maxDate = dateTo   || allArrivals.sort().reverse()[0];

    const filteredOta = otaRows.filter(r => {
      if (dateFrom && r.arrival < dateFrom) return false;
      if (dateTo   && r.arrival > dateTo)   return false;
      return true;
    });

    const bnbWhere = {
      source: { contains: source, mode: 'insensitive' },
      checkInDate: { gte: minDate, lte: maxDate },
      status: { notIn: ['已刪除'] },
    };
    if (warehouse) bnbWhere.warehouse = warehouse;

    const bnbRecords = await prisma.bnbBookingRecord.findMany({
      where: bnbWhere,
      orderBy: { checkInDate: 'asc' },
    });

    const bnbList = bnbRecords.map(r => ({
      id:           r.id,
      guestName:    r.guestName,
      roomNo:       r.roomNo,
      checkInDate:  r.checkInDate,
      checkOutDate: r.checkOutDate,
      roomCharge:   Number(r.roomCharge),
      otherCharge:  Number(r.otherCharge),
      payCard:      Number(r.payCard),
      status:       r.status,
      matched:      false,
    }));

    const matched = [];
    const usedBnbIds = new Set();
    const usedOtaIdx = new Set();

    for (let oi = 0; oi < filteredOta.length; oi++) {
      const ota = filteredOta[oi];
      if (ota.status === 'CANCELLED' && ota.finalAmount === 0) continue;

      let bestIdx = -1;
      let bestScore = -1;

      for (let bi = 0; bi < bnbList.length; bi++) {
        if (usedBnbIds.has(bi)) continue;
        const bnb = bnbList[bi];

        if (bnb.checkInDate !== ota.arrival) continue;
        if (bnb.checkOutDate !== ota.departure) continue;

        let score = 10;

        const amtDiff = Math.abs(bnb.roomCharge - ota.finalAmount);
        if (amtDiff === 0) score += 20;
        else if (amtDiff <= 2) score += 15;
        else if (amtDiff <= bnb.roomCharge * 0.02) score += 10;
        else if (amtDiff <= bnb.roomCharge * 0.05) score += 5;

        if (namesOverlap(ota.guestName, bnb.guestName)) score += 15;
        if (namesOverlap(ota.bookerName, bnb.guestName)) score += 10;

        if (score > bestScore) {
          bestScore = score;
          bestIdx = bi;
        }
      }

      if (bestIdx >= 0 && bestScore >= 20) {
        const bnb = bnbList[bestIdx];
        const amtDiff = bnb.roomCharge - ota.finalAmount;
        matched.push({
          otaIdx: oi,
          bnbIdx: bestIdx,
          ota: {
            reservationNo: ota.reservationNo,
            guestName: ota.guestName,
            bookerName: ota.bookerName,
            arrival: ota.arrival,
            departure: ota.departure,
            finalAmount: ota.finalAmount,
            commissionAmt: ota.commissionAmt,
            commissionPct: ota.commissionPct,
            roomNights: ota.roomNights,
            status: ota.status,
          },
          bnb: {
            id: bnb.id,
            guestName: bnb.guestName,
            roomNo: bnb.roomNo,
            checkInDate: bnb.checkInDate,
            checkOutDate: bnb.checkOutDate,
            roomCharge: bnb.roomCharge,
          },
          amountDiff: Math.round(amtDiff * 100) / 100,
          matchScore: bestScore,
          hasAmtIssue: Math.abs(amtDiff) > 2,
          hasNameIssue: !namesOverlap(ota.guestName, bnb.guestName) && !namesOverlap(ota.bookerName, bnb.guestName),
        });
        usedBnbIds.add(bestIdx);
        usedOtaIdx.add(oi);
        bnbList[bestIdx].matched = true;
      }
    }

    const unmatchedOta = filteredOta
      .filter((_, i) => !usedOtaIdx.has(i))
      .filter(r => !(r.status === 'CANCELLED' && r.finalAmount === 0))
      .map(r => ({
        reservationNo: r.reservationNo,
        guestName: r.guestName,
        bookerName: r.bookerName,
        arrival: r.arrival,
        departure: r.departure,
        finalAmount: r.finalAmount,
        commissionAmt: r.commissionAmt,
        status: r.status,
      }));

    const unmatchedBnb = bnbList
      .filter(b => !b.matched)
      .map(b => ({
        id: b.id,
        guestName: b.guestName,
        roomNo: b.roomNo,
        checkInDate: b.checkInDate,
        checkOutDate: b.checkOutDate,
        roomCharge: b.roomCharge,
        status: b.status,
      }));

    const cancelledOta = filteredOta
      .filter(r => r.status === 'CANCELLED')
      .map(r => ({
        reservationNo: r.reservationNo,
        guestName: r.guestName,
        arrival: r.arrival,
        departure: r.departure,
        originalAmount: r.originalAmount,
        finalAmount: r.finalAmount,
      }));

    const otaTotal       = filteredOta.filter(r => r.status !== 'CANCELLED').reduce((s, r) => s + r.finalAmount, 0);
    const otaCommission  = filteredOta.filter(r => r.status !== 'CANCELLED').reduce((s, r) => s + r.commissionAmt, 0);
    const bnbTotal       = bnbList.reduce((s, b) => s + b.roomCharge, 0);
    const matchedOtaAmt  = matched.reduce((s, m) => s + m.ota.finalAmount, 0);
    const matchedBnbAmt  = matched.reduce((s, m) => s + m.bnb.roomCharge, 0);

    return NextResponse.json({
      source,
      dateRange: { from: minDate, to: maxDate },
      otaRowCount: filteredOta.length,
      bnbRowCount: bnbList.length,
      summary: {
        otaTotal:        Math.round(otaTotal * 100) / 100,
        otaCommission:   Math.round(otaCommission * 100) / 100,
        bnbTotal:        Math.round(bnbTotal * 100) / 100,
        diff:            Math.round((bnbTotal - otaTotal) * 100) / 100,
        matchedCount:    matched.length,
        matchedOtaAmt:   Math.round(matchedOtaAmt * 100) / 100,
        matchedBnbAmt:   Math.round(matchedBnbAmt * 100) / 100,
        unmatchedOtaCnt: unmatchedOta.length,
        unmatchedBnbCnt: unmatchedBnb.length,
        cancelledCount:  cancelledOta.length,
        issueCount:      matched.filter(m => m.hasAmtIssue || m.hasNameIssue).length,
      },
      matched,
      unmatchedOta,
      unmatchedBnb,
      cancelledOta,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

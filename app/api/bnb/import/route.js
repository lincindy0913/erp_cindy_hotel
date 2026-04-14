/**
 * POST /api/bnb/import
 *
 * 解析雲掌櫃匯出的 Excel/CSV，批次建立 BnbBookingRecord
 *
 * Body: multipart/form-data
 *   file       — .xlsx / .xls / .csv
 *   importMonth — YYYY-MM（指定匯入月份）
 *   warehouse  — 館別（預設「民宿」）
 *   replace    — "true" 則先刪除同月同館的舊資料再匯入
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

export const dynamic = 'force-dynamic';

// 解析日期字串 → YYYY-MM-DD
function parseDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // 已是 YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Excel serial date number
  if (/^\d+$/.test(s)) {
    const d = new Date((parseInt(s) - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  // YYYY/MM/DD
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return s.slice(0, 10);
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_CREATE, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const formData    = await request.formData();
    const file        = formData.get('file');
    const importMonth = formData.get('importMonth'); // 2026-03
    const warehouse   = formData.get('warehouse') || '民宿';
    const replace     = formData.get('replace') === 'true';

    if (!file || !importMonth) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少檔案或匯入月份', 400);
    }
    if (!/^\d{4}-\d{2}$/.test(importMonth)) {
      return createErrorResponse('VALIDATION_FAILED', '月份格式需為 YYYY-MM', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name || '';

    // 解析 CSV 或 Excel
    let rows = [];

    if (fileName.toLowerCase().endsWith('.csv')) {
      // CSV 解析
      const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = text.split('\n').filter(l => l.trim());
      // 跳過標題行
      const dataLines = lines.slice(1);
      rows = dataLines.map(line => {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        return cols;
      });
    } else {
      // Excel 解析（動態 import xlsx）
      const XLSX = await import('xlsx');
      const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: false });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      // 跳過第一列標題
      rows = raw.slice(1).filter(r => r.some(c => String(c).trim()));
    }

    // 欄位對應：A=0 來源, B=1 姓名, C=2 本期房費, D=3 本期消費, E=4 房間, F=5 入住, G=6 離店, H=7 狀態
    const records = rows
      .filter(r => String(r[1] || '').trim())  // 姓名不得空
      .map(r => ({
        importMonth,
        warehouse,
        source:      String(r[0] || '').trim() || '其他',
        guestName:   String(r[1] || '').trim(),
        roomCharge:  parseFloat(String(r[2] || '0').replace(/,/g, '')) || 0,
        otherCharge: parseFloat(String(r[3] || '0').replace(/,/g, '')) || 0,
        roomNo:      String(r[4] || '').trim() || null,
        checkInDate: parseDate(r[5]),
        checkOutDate:parseDate(r[6]),
        status:      String(r[7] || '').trim() || '已入住',
      }))
      .filter(r => r.checkInDate && r.checkOutDate);

    if (records.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '找不到有效的訂房資料，請確認欄位格式', 400);
    }

    // replace 模式：先刪同月舊資料
    let deleted = 0;
    if (replace) {
      const del = await prisma.bnbBookingRecord.deleteMany({ where: { importMonth, warehouse } });
      deleted = del.count;
    }

    await prisma.bnbBookingRecord.createMany({ data: records });

    return NextResponse.json({
      imported: records.length,
      deleted,
      importMonth,
      warehouse,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

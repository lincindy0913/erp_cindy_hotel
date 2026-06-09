import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

function parseManualChecks(noteStr) {
  if (!noteStr) return {};
  try {
    const parsed = JSON.parse(noteStr);
    return parsed.manualChecks || {};
  } catch {
    return {};
  }
}

function buildNoteStr(existingNote, updatedChecks) {
  let noteData = {};
  if (existingNote) {
    try { noteData = JSON.parse(existingNote); } catch {}
  }
  noteData.manualChecks = updatedChecks;
  return JSON.stringify(noteData);
}

// GET /api/month-end/manual-check?year=YYYY&month=M
// 回傳該月人工確認狀態 { vat_filing: true, ... }
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.MONTHEND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year  = parseInt(searchParams.get('year'));
    const month = parseInt(searchParams.get('month'));
    if (!year || !month) return NextResponse.json({});

    const record = await prisma.monthEndStatus.findFirst({
      where: { year, month, warehouse: null },
      select: { note: true },
    });

    return NextResponse.json(parseManualChecks(record?.note));
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/month-end/manual-check
// body: { year, month, key, value }
// 儲存到 MonthEndStatus(warehouse=null).note 的 manualChecks JSON 中
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.MONTHEND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { year, month, key, value } = await request.json();
    if (!year || !month || !key) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', 'year, month, key 為必填', 400);
    }

    const existing = await prisma.monthEndStatus.findFirst({
      where: { year, month, warehouse: null },
      select: { id: true, note: true },
    });

    const currentChecks = parseManualChecks(existing?.note);
    currentChecks[key]  = !!value;
    const noteStr       = buildNoteStr(existing?.note, currentChecks);

    if (existing) {
      await prisma.monthEndStatus.update({
        where: { id: existing.id },
        data:  { note: noteStr },
      });
    } else {
      await prisma.monthEndStatus.create({
        data: { year, month, warehouse: null, status: '未結帳', note: noteStr },
      });
    }

    return NextResponse.json({ ok: true, manualChecks: currentChecks });
  } catch (error) {
    return handleApiError(error);
  }
}

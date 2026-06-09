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

// GET /api/year-end/manual-check?year=YYYY
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.MONTHEND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year'));
    if (!year) return NextResponse.json({});

    const record = await prisma.yearEndRollover.findFirst({
      where:  { year },
      select: { note: true },
    });

    return NextResponse.json(parseManualChecks(record?.note));
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/year-end/manual-check
// body: { year, key, value }
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.MONTHEND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { year, key, value } = await request.json();
    if (!year || !key) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', 'year, key 為必填', 400);
    }

    const existing = await prisma.yearEndRollover.findFirst({
      where:  { year },
      select: { id: true, note: true },
    });

    const currentChecks = parseManualChecks(existing?.note);
    currentChecks[key]  = !!value;
    const noteStr       = buildNoteStr(existing?.note, currentChecks);

    if (existing) {
      await prisma.yearEndRollover.update({
        where: { id: existing.id },
        data:  { note: noteStr },
      });
    } else {
      // 年結尚未執行時先建一筆草稿記錄，status 沿用預設「進行中」
      await prisma.yearEndRollover.create({
        data: { year, status: '進行中', note: noteStr },
      });
    }

    return NextResponse.json({ ok: true, manualChecks: currentChecks });
  } catch (error) {
    return handleApiError(error);
  }
}

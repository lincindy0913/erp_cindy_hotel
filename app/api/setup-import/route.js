import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/setup-import
 * 取得所有匯入作業 (ImportSession)
 */
export async function GET() {
  try {
    const sessions = await prisma.importSession.findMany({
      include: {
        batches: {
          select: { id: true, importType: true, status: true, totalRows: true, importedRows: true, errorRows: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(sessions);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/setup-import
 * 建立新匯入作業 (ImportSession)
 * body: { openingDate, note }
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const userName = session?.user?.name || session?.user?.email || 'system';

    const body = await request.json();
    const { openingDate, note } = body;

    if (!openingDate) {
      return NextResponse.json({ error: '開帳基準日為必填', code: 'REQUIRED_FIELD_MISSING' }, { status: 400 });
    }

    // Generate session number
    const year = new Date().getFullYear();
    const count = await prisma.importSession.count({
      where: { sessionNo: { startsWith: `IMPORT-${year}-` } }
    });
    const sessionNo = `IMPORT-${year}-${String(count + 1).padStart(3, '0')}`;

    const importSession = await prisma.importSession.create({
      data: {
        sessionNo,
        openingDate,
        note: note || null,
        createdBy: userName,
      }
    });

    return NextResponse.json(importSession, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

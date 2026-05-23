import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requireSession, isAdmin } from '@/lib/api-auth';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const VALID_TIERS = ['tier1_full', 'tier2_snapshot', 'tier3_full'];

// GET /api/backup — list backup records + current config (admin only)
export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    if (!isAdmin(auth.session)) return createErrorResponse('FORBIDDEN', '權限不足', 403);

    const [records, config] = await Promise.all([
      prisma.backupRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.backupConfig.findFirst({ orderBy: { id: 'asc' } }),
    ]);

    return NextResponse.json({
      records: records.map(r => ({ ...r, fileSize: r.fileSize?.toString() ?? null })),
      config,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/backup — trigger a new backup (admin only)
export async function POST(request) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    if (!isAdmin(auth.session)) return createErrorResponse('FORBIDDEN', '權限不足', 403);

    const body = await request.json();
    const { tier } = body;

    if (!tier || !VALID_TIERS.includes(tier)) {
      return createErrorResponse('VALIDATION_FAILED', `tier 必須為: ${VALID_TIERS.join(', ')}`, 400);
    }

    // Block if a backup is already running
    const running = await prisma.backupRecord.findFirst({
      where: { status: 'in_progress' },
    });
    if (running) {
      return createErrorResponse('BACKUP_IN_PROGRESS', `備份任務 #${running.id} 正在執行中，請稍後再試`, 409);
    }

    const createdBy = auth.session.user.name || auth.session.user.email || 'admin';
    const backupRecord = await prisma.backupRecord.create({
      data: {
        tier,
        triggerType: 'manual',
        status: 'in_progress',
        createdBy,
      },
    });

    // Spawn backup worker as detached child process (non-blocking)
    const workerPath = path.join(process.cwd(), 'scripts', 'backup-worker.mjs');
    const child = spawn('node', [workerPath, String(backupRecord.id)], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.BACKUP_CREATE,
      targetModule: 'backup',
      targetRecordId: backupRecord.id,
      afterState: { tier, triggerType: 'manual' },
      note: `手動觸發 ${tier} 備份`,
    }).catch(() => {});

    return NextResponse.json(
      { ...backupRecord, fileSize: backupRecord.fileSize?.toString() ?? null },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

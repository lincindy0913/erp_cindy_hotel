import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createAlert, ALERT_CATEGORIES } from '@/lib/alert';
import { executeRestoreDrill, validateBackupPath, cleanupOrphanDrillSchemas } from '@/lib/backup-restore';

export const dynamic = 'force-dynamic';

// GET - List restore drill history with RTO/RPO compliance summary
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BACKUP_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit')) || 20, 100);

    const drills = await prisma.restoreDrill.findMany({
      include: {
        backup: { select: { id: true, tier: true, filePath: true, startedAt: true, completedAt: true, status: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    const config = await prisma.backupConfig.findFirst({ orderBy: { id: 'asc' } });

    // Summary statistics
    const lastDrill = drills[0] || null;
    const passedCount = drills.filter(d => d.status === 'passed').length;
    const failedCount = drills.filter(d => d.status === 'failed').length;

    // RTO/RPO compliance from recent drills
    const recentDrills = drills.filter(d => d.status !== 'in_progress').slice(0, 10);
    const rtoPassCount = recentDrills.filter(d => d.rtoCompliant === true).length;
    const rpoPassCount = recentDrills.filter(d => d.rpoCompliant === true).length;
    const avgRestoreMs = recentDrills.length > 0
      ? Math.round(recentDrills.filter(d => d.restoreDurationMs).reduce((s, d) => s + d.restoreDurationMs, 0) / Math.max(recentDrills.filter(d => d.restoreDurationMs).length, 1))
      : null;

    // Days since last drill
    const daysSinceLastDrill = lastDrill?.startedAt
      ? Math.floor((Date.now() - new Date(lastDrill.startedAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;

    // Is a drill overdue?
    const drillFrequencyDays = config?.drillFrequencyDays || 7;
    const drillOverdue = daysSinceLastDrill != null ? daysSinceLastDrill >= drillFrequencyDays : true;

    return NextResponse.json({
      drills: drills.map(d => ({
        ...d,
        startedAt: d.startedAt?.toISOString(),
        completedAt: d.completedAt?.toISOString(),
      })),
      summary: {
        totalDrills: drills.length,
        passedCount,
        failedCount,
        lastDrillAt: lastDrill?.startedAt?.toISOString() || null,
        lastDrillStatus: lastDrill?.status || null,
        daysSinceLastDrill,
        drillOverdue,
        drillFrequencyDays,
      },
      rtoRpo: {
        rtoTargetMinutes: config?.rtoTargetMinutes || 60,
        rpoTargetHours: config?.rpoTargetHours || 24,
        recentRtoPassRate: recentDrills.length > 0 ? `${rtoPassCount}/${recentDrills.length}` : null,
        recentRpoPassRate: recentDrills.length > 0 ? `${rpoPassCount}/${recentDrills.length}` : null,
        avgRestoreMs,
        avgRestoreFormatted: avgRestoreMs != null ? formatDuration(avgRestoreMs) : null,
        lastRtoCompliant: lastDrill?.rtoCompliant ?? null,
        lastRpoCompliant: lastDrill?.rpoCompliant ?? null,
        lastRestoreDurationMs: lastDrill?.restoreDurationMs ?? null,
        lastDataAgeMinutes: lastDrill?.dataAgeMinutes ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error, '/api/backup/restore-drill');
  }
}

// POST - Execute a restore drill with actual restore testing + RTO/RPO measurement
// Body: { backupId?: number, autoRestore?: boolean }
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.BACKUP_EXECUTE);
  if (!auth.ok) return auth.response;

  try {
    let body = {};
    try { body = await request.json(); } catch { /* empty body ok */ }

    const triggeredBy = auth.session?.user?.name || auth.session?.user?.email || 'system';

    // Select backup to test
    let backup;
    if (body.backupId) {
      backup = await prisma.backupRecord.findUnique({ where: { id: parseInt(body.backupId) } });
      if (!backup) return createErrorResponse('BACKUP_NOT_FOUND', '找不到指定備份', 404);
    } else {
      backup = await prisma.backupRecord.findFirst({
        where: { status: { in: ['completed', 'verified'] } },
        orderBy: { completedAt: 'desc' },
      });
      if (!backup) return createErrorResponse('BACKUP_NOT_FOUND', '找不到可用的備份，請先執行備份', 404);
    }

    if (!backup.filePath) {
      return createErrorResponse('VALIDATION_FAILED', '備份檔案路徑不存在', 400);
    }

    // Path traversal protection
    const pathCheck = validateBackupPath(backup.filePath);
    if (!pathCheck.ok) {
      return createErrorResponse('VALIDATION_FAILED', pathCheck.reason, 400);
    }

    // Clean up any orphaned drill schemas from crashed previous drills
    await cleanupOrphanDrillSchemas().catch(() => { /* best effort */ });

    // Load config for RTO/RPO targets
    const config = await prisma.backupConfig.findFirst({ orderBy: { id: 'asc' } });

    // Create drill record
    const drill = await prisma.restoreDrill.create({
      data: {
        backupRecordId: backup.id,
        status: 'in_progress',
        triggeredBy,
        rtoTargetMinutes: config?.rtoTargetMinutes || 60,
        rpoTargetHours: config?.rpoTargetHours || 24,
      },
    });

    // Execute actual restore drill
    const autoRestore = body.autoRestore !== false;
    const drillResult = await executeRestoreDrill(backup, config, prisma, { autoRestore });

    const finalStatus = drillResult.allTestsPassed ? 'passed' : 'failed';

    // Update drill record with full results
    await prisma.restoreDrill.update({
      where: { id: drill.id },
      data: {
        status: finalStatus,
        fileIntegrity: drillResult.results.fileIntegrity,
        checksumMatch: drillResult.results.checksumMatch,
        dataReadable: drillResult.results.dataReadable,
        recordCountMatch: drillResult.results.recordCountMatch,
        sampleDataValid: drillResult.results.sampleDataValid,
        actualRestore: drillResult.results.actualRestore,
        restoreMethod: drillResult.restoreMethod,
        tablesExpected: drillResult.tablesExpected,
        tablesRestored: drillResult.tablesRestored,
        recordsExpected: drillResult.recordsExpected,
        recordsRestored: drillResult.recordsRestored,
        restoreDurationMs: drillResult.restoreDurationMs,
        dataAgeMinutes: drillResult.dataAgeMinutes,
        rtoCompliant: drillResult.rtoCompliant,
        rpoCompliant: drillResult.rpoCompliant,
        details: drillResult.details,
        errorMessage: drillResult.errorMessage,
        completedAt: new Date(),
      },
    });

    // Alert on failure or RTO/RPO breach
    const alerts = [];

    if (!drillResult.allTestsPassed) {
      const failedTests = Object.entries(drillResult.results)
        .filter(([, v]) => !v)
        .map(([k]) => k)
        .join(', ');
      alerts.push(`驗證失敗項目: ${failedTests}`);
    }

    if (!drillResult.rtoCompliant) {
      alerts.push(`RTO 超標: 實際 ${formatDuration(drillResult.restoreDurationMs)}，目標 ${drillResult.rtoTargetMinutes} 分鐘`);
    }

    if (!drillResult.rpoCompliant) {
      const ageHours = drillResult.dataAgeMinutes != null ? (drillResult.dataAgeMinutes / 60).toFixed(1) : '?';
      alerts.push(`RPO 超標: 資料年齡 ${ageHours} 小時，目標 ${drillResult.rpoTargetHours} 小時`);
    }

    if (alerts.length > 0) {
      await createAlert(
        ALERT_CATEGORIES.RESTORE_DRILL_FAILURE,
        '備份還原演練異常',
        alerts.join('；'),
        {
          backupId: backup.id,
          drillId: drill.id,
          rtoCompliant: drillResult.rtoCompliant,
          rpoCompliant: drillResult.rpoCompliant,
          restoreDurationMs: drillResult.restoreDurationMs,
          dataAgeMinutes: drillResult.dataAgeMinutes,
        }
      );
    }

    return NextResponse.json({
      success: true,
      drillId: drill.id,
      backupId: backup.id,
      tier: backup.tier,
      status: finalStatus,
      results: drillResult.results,
      rto: {
        targetMinutes: drillResult.rtoTargetMinutes,
        actualMs: drillResult.restoreDurationMs,
        actualFormatted: formatDuration(drillResult.restoreDurationMs),
        compliant: drillResult.rtoCompliant,
      },
      rpo: {
        targetHours: drillResult.rpoTargetHours,
        actualMinutes: drillResult.dataAgeMinutes,
        actualFormatted: drillResult.dataAgeMinutes != null ? `${(drillResult.dataAgeMinutes / 60).toFixed(1)} 小時` : null,
        compliant: drillResult.rpoCompliant,
      },
      restoreMethod: drillResult.restoreMethod,
      tablesRestored: drillResult.tablesRestored,
      recordsRestored: drillResult.recordsRestored,
      details: drillResult.details,
      errorMessage: drillResult.errorMessage,
      alerts: alerts.length > 0 ? alerts : undefined,
    });
  } catch (error) {
    return handleApiError(error, '/api/backup/restore-drill');
  }
}

function formatDuration(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

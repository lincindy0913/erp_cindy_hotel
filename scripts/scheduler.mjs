#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();
const TZ = process.env.BACKUP_TIMEZONE || 'Asia/Taipei';

function formatHHMM(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatYMD(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dayOfWeek(date = new Date()) {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TZ }).format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[day] ?? 0;
}

async function getConfig() {
  let config = await prisma.backupConfig.findFirst({ orderBy: { id: 'asc' } });
  if (!config) {
    config = await prisma.backupConfig.create({
      data: {
        tier1BackupTime: '04:00',
        tier2SnapshotTime: '04:30',
        backupCleanTime: '05:00',
        verifyDayOfWeek: 0,
        verifyTime: '06:00',
        tier1RetainDays: 90,
        tier2RetainDays: 30,
      },
    });
  }
  return config;
}

async function hasRecentRunningOrScheduled(tier) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const exists = await prisma.backupRecord.findFirst({
    where: {
      tier,
      startedAt: { gte: tenMinutesAgo },
      status: { in: ['in_progress', 'completed', 'verified'] },
      triggerType: 'scheduled',
    },
    select: { id: true },
  });
  return !!exists;
}

function spawnWorker(backupId) {
  const workerPath = path.join(process.cwd(), 'scripts', 'backup-worker.mjs');
  const child = spawn(process.execPath, [workerPath, String(backupId)], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
}

async function enqueueScheduledBackup(tier) {
  if (await hasRecentRunningOrScheduled(tier)) return;

  // Global lock: skip if ANY backup is currently in progress (prevent tier overlap)
  const anyInProgress = await prisma.backupRecord.findFirst({
    where: { status: 'in_progress' },
    select: { id: true, tier: true, startedAt: true },
  });
  if (anyInProgress) {
    // Auto-fail backups stuck > 2 hours
    const stuckThreshold = 2 * 60 * 60 * 1000;
    if (Date.now() - new Date(anyInProgress.startedAt).getTime() > stuckThreshold) {
      await prisma.backupRecord.update({
        where: { id: anyInProgress.id },
        data: { status: 'failed', errorMessage: '備份超時（逾 2 小時），排程器自動標記為失敗', completedAt: new Date() },
      });
      console.log(`[scheduler] auto-failed stuck backup #${anyInProgress.id} (${anyInProgress.tier})`);
    } else {
      console.log(`[scheduler] skipping ${tier} — ${anyInProgress.tier} #${anyInProgress.id} still in progress`);
      return;
    }
  }

  const today = formatYMD();
  const record = await prisma.backupRecord.create({
    data: {
      tier,
      triggerType: 'scheduled',
      businessPeriod: tier.startsWith('tier3') ? today.slice(0, 7) : null,
      status: 'in_progress',
      createdBy: 'system-scheduler',
      startedAt: new Date(),
    },
  });
  spawnWorker(record.id);
  console.log(`[scheduler] scheduled backup started: ${tier} #${record.id}`);
}

async function cleanupOldRecords(config) {
  const now = new Date();
  const tier1Before = new Date(now.getTime() - (config.tier1RetainDays || 90) * 24 * 60 * 60 * 1000);
  const tier2Before = new Date(now.getTime() - (config.tier2RetainDays || 30) * 24 * 60 * 60 * 1000);

  const deletable = await prisma.backupRecord.findMany({
    where: {
      OR: [
        { tier: 'tier1_full', startedAt: { lt: tier1Before } },
        { tier: 'tier2_snapshot', startedAt: { lt: tier2Before } },
      ],
      status: { in: ['completed', 'verified', 'failed', 'corrupted'] },
    },
    select: { id: true, filePath: true },
  });

  for (const rec of deletable) {
    if (rec.filePath) {
      try { await import('fs/promises').then(fs => fs.default.unlink(rec.filePath)); } catch { /* ignore */ }
    }
  }

  if (deletable.length > 0) {
    await prisma.backupRecord.deleteMany({
      where: { id: { in: deletable.map(r => r.id) } },
    });
    console.log(`[scheduler] cleaned ${deletable.length} expired backup records`);
  }
}

async function shouldRunDrill(config) {
  // Check if drill is enabled
  if (config.drillEnabled === false) return false;

  const frequencyDays = config.drillFrequencyDays || 7;

  // Find last completed drill
  const lastDrill = await prisma.restoreDrill.findFirst({
    where: { status: { in: ['passed', 'failed'] } },
    orderBy: { completedAt: 'desc' },
    select: { completedAt: true },
  });

  if (!lastDrill?.completedAt) return true; // never run before

  const daysSince = (Date.now() - new Date(lastDrill.completedAt).getTime()) / (24 * 60 * 60 * 1000);
  return daysSince >= frequencyDays;
}

async function runAutomatedRestoreDrill(config) {
  try {
    // Find latest completed/verified backup
    const backup = await prisma.backupRecord.findFirst({
      where: { status: { in: ['completed', 'verified'] } },
      orderBy: { completedAt: 'desc' },
    });
    if (!backup || !backup.filePath) {
      console.log('[scheduler] no backup available for restore drill');
      return;
    }

    const rtoTarget = config.rtoTargetMinutes || 60;
    const rpoTarget = config.rpoTargetHours || 24;
    const autoRestore = config.drillAutoRestore !== false;

    // Create drill record
    const drill = await prisma.restoreDrill.create({
      data: {
        backupRecordId: backup.id,
        status: 'in_progress',
        triggeredBy: 'system-scheduler',
        rtoTargetMinutes: rtoTarget,
        rpoTargetHours: rpoTarget,
      },
    });

    // Dynamic import of shared restore library (ESM from scripts/)
    const { executeRestoreDrill, cleanupOrphanDrillSchemas } = await import('../lib/backup-restore.js');

    // Clean up any orphaned drill schemas from crashed previous drills
    try {
      const cleanup = await cleanupOrphanDrillSchemas();
      if (cleanup.cleaned > 0) console.log(`[scheduler] cleaned ${cleanup.cleaned} orphaned drill schema(s)`);
    } catch { /* best effort */ }

    const drillResult = await executeRestoreDrill(backup, config, prisma, { autoRestore });

    const finalStatus = drillResult.allTestsPassed ? 'passed' : 'failed';

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

    const rtoFormatted = drillResult.restoreDurationMs < 60000
      ? `${(drillResult.restoreDurationMs / 1000).toFixed(1)}s`
      : `${(drillResult.restoreDurationMs / 60000).toFixed(1)}m`;
    const rpoFormatted = drillResult.dataAgeMinutes != null
      ? `${(drillResult.dataAgeMinutes / 60).toFixed(1)}h`
      : '?';

    console.log(`[scheduler] restore drill #${drill.id} ${finalStatus.toUpperCase()} — RTO: ${rtoFormatted} (target: ${rtoTarget}m, ${drillResult.rtoCompliant ? 'OK' : 'BREACH'}) RPO: ${rpoFormatted} (target: ${rpoTarget}h, ${drillResult.rpoCompliant ? 'OK' : 'BREACH'})`);

    // Alert on failure or RTO/RPO breach
    const alerts = [];
    if (!drillResult.allTestsPassed) {
      const failedTests = Object.entries(drillResult.results).filter(([, v]) => !v).map(([k]) => k).join(', ');
      alerts.push(`驗證失敗: ${failedTests}`);
    }
    if (!drillResult.rtoCompliant) {
      alerts.push(`RTO 超標: ${rtoFormatted} > ${rtoTarget}m`);
    }
    if (!drillResult.rpoCompliant) {
      alerts.push(`RPO 超標: ${rpoFormatted} > ${rpoTarget}h`);
    }

    if (alerts.length > 0) {
      const alertMsg = alerts.join('；');
      await prisma.errorAlertLog.create({
        data: {
          category: 'restore_drill_failure',
          title: '備份還原演練異常',
          message: `Backup #${backup.id}: ${alertMsg}`,
          metadata: { backupId: backup.id, drillId: drill.id, rtoCompliant: drillResult.rtoCompliant, rpoCompliant: drillResult.rpoCompliant },
        },
      });
      await prisma.notification.upsert({
        where: { notificationCode: 'N14' },
        create: {
          notificationCode: 'N14', title: `[restore_drill] 還原演練異常`,
          level: 'critical', targetUrl: '/admin/backup', count: 1, isActive: true,
          metadata: { category: 'restore_drill_failure', backupId: backup.id, alerts, lastOccurredAt: new Date().toISOString() },
        },
        update: {
          title: `[restore_drill] 還原演練異常`,
          level: 'critical', isActive: true, count: { increment: 1 }, calculatedAt: new Date(),
          metadata: { category: 'restore_drill_failure', backupId: backup.id, alerts, lastOccurredAt: new Date().toISOString() },
        },
      });
    }
  } catch (err) {
    console.error('[scheduler] restore drill error:', err.message);
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const config = await getConfig();
    const now = new Date();
    const nowHHMM = formatHHMM(now);
    const nowDow = dayOfWeek(now);

    if (nowHHMM === (config.tier1BackupTime || '04:00')) {
      await enqueueScheduledBackup('tier1_full');
    }
    if (nowHHMM === (config.tier2SnapshotTime || '04:30')) {
      await enqueueScheduledBackup('tier2_snapshot');
    }

    if (nowHHMM === (config.backupCleanTime || '05:00')) {
      await cleanupOldRecords(config);
    }

    // Restore drill: runs at verifyTime if drill is due (configurable frequency)
    if (nowHHMM === (config.verifyTime || '06:00')) {
      if (await shouldRunDrill(config)) {
        console.log('[scheduler] restore drill due — running automated restore drill with actual restore testing');
        await runAutomatedRestoreDrill(config);
      }
    }
  } catch (error) {
    console.error('[scheduler] tick error:', error);
    // Create alert for scheduler failures
    try {
      await prisma.errorAlertLog.create({
        data: {
          category: 'scheduler_failure',
          title: '排程任務執行失敗',
          message: error.message || 'Unknown scheduler error',
          metadata: { stack: error.stack?.split('\n').slice(0, 5) },
        },
      });
      await prisma.notification.upsert({
        where: { notificationCode: 'N14' },
        create: {
          notificationCode: 'N14',
          title: '[scheduler_failure] 排程任務執行失敗',
          level: 'critical',
          targetUrl: '/admin/backup',
          count: 1,
          isActive: true,
          metadata: { category: 'scheduler_failure', message: error.message, lastOccurredAt: new Date().toISOString() },
        },
        update: {
          title: '[scheduler_failure] 排程任務執行失敗',
          level: 'critical',
          isActive: true,
          count: { increment: 1 },
          calculatedAt: new Date(),
          metadata: { category: 'scheduler_failure', message: error.message, lastOccurredAt: new Date().toISOString() },
        },
      });
    } catch (alertErr) {
      console.error('[scheduler] failed to create alert:', alertErr.message);
    }
  } finally {
    running = false;
  }
}

async function main() {
  console.log(`[scheduler] started, timezone=${TZ}`);
  await tick();
  setInterval(tick, 60 * 1000);
}

main().catch(async (error) => {
  console.error('[scheduler] fatal:', error);
  await gracefulShutdown('fatal');
  process.exit(1);
});

async function gracefulShutdown(signal) {
  console.log(`[scheduler] shutting down (${signal})...`);
  try {
    // Mark all in-progress backups as failed (they'll be orphaned after shutdown)
    const orphanedBackups = await prisma.backupRecord.findMany({
      where: { status: 'in_progress' },
      select: { id: true, tier: true },
    });
    if (orphanedBackups.length > 0) {
      await prisma.backupRecord.updateMany({
        where: { status: 'in_progress' },
        data: { status: 'failed', errorMessage: `排程器關閉 (${signal})，備份中斷`, completedAt: new Date() },
      });
      console.log(`[scheduler] marked ${orphanedBackups.length} in-progress backup(s) as failed: ${orphanedBackups.map(b => `#${b.id} ${b.tier}`).join(', ')}`);
    }

    // Mark any in-progress drills as failed
    await prisma.restoreDrill.updateMany({
      where: { status: 'in_progress' },
      data: { status: 'failed', errorMessage: `排程器關閉 (${signal})`, completedAt: new Date() },
    });
  } catch (err) {
    console.error('[scheduler] error during shutdown cleanup:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

process.on('SIGINT', async () => {
  await gracefulShutdown('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await gracefulShutdown('SIGTERM');
  process.exit(0);
});

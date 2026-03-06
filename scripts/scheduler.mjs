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

    if (nowHHMM === (config.verifyTime || '06:00') && nowDow === (config.verifyDayOfWeek ?? 0)) {
      console.log('[scheduler] verify window reached (manual verify API still available)');
    }
  } catch (error) {
    console.error('[scheduler] tick error:', error);
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
  await prisma.$disconnect();
  process.exit(1);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

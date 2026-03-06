#!/usr/bin/env node
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BACKUP_ROOT = process.env.BACKUP_ROOT || path.join(process.cwd(), 'backup-data');

function todayStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function spawnAndWait(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}: ${stderr || 'unknown error'}`));
    });
  });
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function tableExportPlan(tier) {
  if (tier === 'tier2_snapshot') {
    return [
      ['accountMonthlySnapshots', () => prisma.accountMonthlySnapshot.findMany()],
      ['inventoryMonthlySnapshots', () => prisma.inventoryMonthlySnapshot.findMany()],
      ['priceSummaryCaches', () => prisma.priceSummaryCache.findMany()],
      ['monthlyAggregations', () => prisma.monthlyAggregation.findMany()],
      ['inventoryLowStockCaches', () => prisma.inventoryLowStockCache.findMany()],
      ['supplierMonthlySummaries', () => prisma.supplierMonthlySummary.findMany()],
      ['rentalMonthlyCaches', () => prisma.rentalMonthlyCache.findMany()],
    ];
  }

  return [
    ['products', () => prisma.product.findMany()],
    ['suppliers', () => prisma.supplier.findMany()],
    ['purchaseMasters', () => prisma.purchaseMaster.findMany()],
    ['salesMasters', () => prisma.salesMaster.findMany()],
    ['cashAccounts', () => prisma.cashAccount.findMany()],
    ['cashTransactions', () => prisma.cashTransaction.findMany()],
    ['paymentOrders', () => prisma.paymentOrder.findMany()],
    ['cashierExecutions', () => prisma.cashierExecution.findMany()],
    ['checks', () => prisma.check.findMany()],
    ['loanMasters', () => prisma.loanMaster.findMany()],
    ['loanMonthlyRecords', () => prisma.loanMonthlyRecord.findMany()],
    ['monthEndStatuses', () => prisma.monthEndStatus.findMany()],
    ['yearEndRollovers', () => prisma.yearEndRollover.findMany()],
    ['bankReconciliations', () => prisma.bankReconciliation.findMany()],
    ['auditLogs', () => prisma.auditLog.findMany()],
  ];
}

async function createPgDump(filePath) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未設定，無法執行 Tier 1 全量備份');
  }

  let parsed;
  try {
    parsed = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL 格式錯誤，無法解析');
  }

  const dbName = parsed.pathname?.replace(/^\//, '');
  if (!dbName) throw new Error('DATABASE_URL 缺少資料庫名稱');

  const username = decodeURIComponent(parsed.username || '');
  const password = decodeURIComponent(parsed.password || '');
  const host = parsed.hostname || 'localhost';
  const port = parsed.port || '5432';

  await spawnAndWait(
    'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file', filePath,
      '--host', host,
      '--port', port,
      '--username', username,
      dbName,
    ],
    { env: { ...process.env, PGPASSWORD: password } }
  );
}

async function estimateCoreCounts() {
  const counts = await Promise.all([
    prisma.product.count(),
    prisma.supplier.count(),
    prisma.purchaseMaster.count(),
    prisma.salesMaster.count(),
    prisma.cashAccount.count(),
    prisma.cashTransaction.count(),
    prisma.paymentOrder.count(),
    prisma.check.count(),
  ]);
  return {
    tableCount: counts.length,
    totalRecords: counts.reduce((sum, c) => sum + c, 0),
  };
}

async function createJsonBackup(filePath, tier, backupRecord) {
  const plan = tableExportPlan(tier);
  const data = {};
  let totalRecords = 0;

  for (const [name, getter] of plan) {
    const rows = await getter();
    data[name] = rows;
    totalRecords += rows.length;
  }

  const payload = {
    meta: {
      backupId: backupRecord.id,
      tier,
      triggerType: backupRecord.triggerType,
      businessPeriod: backupRecord.businessPeriod,
      generatedAt: new Date().toISOString(),
    },
    data,
  };

  const source = Readable.from([JSON.stringify(payload)]);
  const gzip = createGzip({ level: 9 });
  const sink = createWriteStream(filePath);
  await pipeline(source, gzip, sink);

  return {
    tableCount: plan.length,
    totalRecords,
  };
}

async function runBackup(backupId) {
  const backupRecord = await prisma.backupRecord.findUnique({ where: { id: backupId } });
  if (!backupRecord) throw new Error(`找不到備份任務: ${backupId}`);
  if (backupRecord.status !== 'in_progress') return;

  const tierDir = path.join(BACKUP_ROOT, backupRecord.tier);
  await ensureDir(tierDir);

  const ext = backupRecord.tier === 'tier1_full' ? 'dump' : 'json.gz';
  const filePath = path.join(tierDir, `${backupRecord.tier}_${todayStamp()}_${backupId}.${ext}`);

  let stats;
  if (backupRecord.tier === 'tier1_full') {
    await createPgDump(filePath);
    stats = await estimateCoreCounts();
  } else {
    stats = await createJsonBackup(filePath, backupRecord.tier, backupRecord);
  }

  const fileStat = await fs.stat(filePath);
  const sha256 = await sha256File(filePath);

  await prisma.backupRecord.update({
    where: { id: backupId },
    data: {
      status: 'completed',
      filePath,
      fileSize: BigInt(fileStat.size),
      sha256,
      tableCount: stats.tableCount,
      totalRecords: stats.totalRecords,
      completedAt: new Date(),
      errorMessage: null,
    },
  });
}

async function failBackup(backupId, error) {
  await prisma.backupRecord.update({
    where: { id: backupId },
    data: {
      status: 'failed',
      errorMessage: error?.message || '備份失敗',
      completedAt: new Date(),
    },
  });

  try {
    const config = await prisma.backupConfig.findFirst({ orderBy: { id: 'asc' } });
    if (config?.notifyOnFailure) {
      await prisma.notification.upsert({
        where: { notificationCode: 'N14' },
        create: {
          notificationCode: 'N14',
          title: '資料備份異常',
          level: 'critical',
          targetUrl: '/admin/backup',
          count: 1,
          isActive: true,
          metadata: {
            source: 'backup-worker',
            backupId,
            errorMessage: error?.message || 'unknown error',
          },
        },
        update: {
          title: '資料備份異常',
          level: 'critical',
          targetUrl: '/admin/backup',
          count: { increment: 1 },
          isActive: true,
          calculatedAt: new Date(),
        },
      });
    }
  } catch (notifyErr) {
    console.error('[backup-worker] failed to create N14 notification:', notifyErr);
  }
}

async function main() {
  const backupId = parseInt(process.argv[2], 10);
  if (Number.isNaN(backupId)) {
    throw new Error('backup-worker 需要傳入 backupId');
  }

  try {
    await runBackup(backupId);
  } catch (error) {
    console.error(`[backup-worker] backup ${backupId} failed:`, error);
    try {
      await failBackup(backupId, error);
    } catch (updateErr) {
      console.error('[backup-worker] failed to update backup status:', updateErr);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error('[backup-worker] fatal:', error);
  await prisma.$disconnect();
  process.exit(1);
});

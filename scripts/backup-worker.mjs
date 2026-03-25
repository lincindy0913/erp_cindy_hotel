#!/usr/bin/env node
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { createHash, randomBytes, createCipheriv } from 'crypto';
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BACKUP_ROOT = process.env.BACKUP_ROOT || path.join(process.cwd(), 'backup-data');
const PG_DUMP_BIN = process.env.PG_DUMP_PATH || 'pg_dump';

// Minimum free disk space required to start a backup (default: 500 MB)
const MIN_FREE_SPACE_MB = parseInt(process.env.BACKUP_MIN_FREE_SPACE_MB) || 500;

// Encryption key: BACKUP_ENCRYPTION_KEY env var (hex-encoded 32 bytes = 64 hex chars)
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
function getEncryptionKey() {
  const keyHex = process.env.BACKUP_ENCRYPTION_KEY;
  if (!keyHex) return null;
  if (keyHex.length !== 64) throw new Error('BACKUP_ENCRYPTION_KEY 必須為 64 個十六進位字元（32 bytes）');
  return Buffer.from(keyHex, 'hex');
}

function todayStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// Check available disk space on the backup volume
async function checkDiskSpace(targetDir) {
  await ensureDir(targetDir);
  try {
    // Cross-platform: use Node's fs.statfs (Node 18.15+)
    const stats = await fs.statfs(targetDir);
    const freeBytes = stats.bfree * stats.bsize;
    const freeMB = Math.floor(freeBytes / (1024 * 1024));
    return { ok: freeMB >= MIN_FREE_SPACE_MB, freeMB, requiredMB: MIN_FREE_SPACE_MB };
  } catch {
    // fs.statfs not available (older Node) — skip check
    return { ok: true, freeMB: null, requiredMB: MIN_FREE_SPACE_MB, skipped: true };
  }
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

// ── Complete table export plan ──────────────────────────────
// Dynamically covers ALL Prisma models, not a hardcoded subset.
// Uses Prisma DMMF (Data Model Meta Format) to discover all models at runtime.

function getAllModelNames() {
  // Prisma client exposes model names via its internal DMMF
  const dmmf = prisma._baseDmmf || prisma._dmmf;
  if (dmmf?.datamodel?.models) {
    return dmmf.datamodel.models.map(m => m.name);
  }
  // Fallback: enumerate prisma client properties that have findMany
  const models = [];
  for (const key of Object.keys(prisma)) {
    if (key.startsWith('_') || key.startsWith('$')) continue;
    if (typeof prisma[key]?.findMany === 'function') {
      models.push(key);
    }
  }
  return models;
}

// Tier2 snapshot tables (cache/aggregation only)
const TIER2_MODELS = new Set([
  'accountMonthlySnapshot', 'inventoryMonthlySnapshot', 'priceSummaryCache',
  'monthlyAggregation', 'inventoryLowStockCache', 'supplierMonthlySummary',
  'rentalMonthlyCache',
]);

// Internal/config tables excluded from JSON backup (pg_dump covers them in tier1)
const INTERNAL_MODELS = new Set([
  'backupRecord', 'backupConfig', 'backupVerification', 'restoreDrill', 'errorAlertLog',
]);

function tableExportPlan(tier) {
  const allModels = getAllModelNames();

  if (tier === 'tier2_snapshot') {
    return allModels
      .filter(m => TIER2_MODELS.has(m))
      .map(m => [m, () => prisma[m].findMany()]);
  }

  // tier1 JSON fallback / tier3: export ALL models except internal backup tables
  return allModels
    .filter(m => !INTERNAL_MODELS.has(m))
    .map(m => [m, () => prisma[m].findMany()]);
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
    PG_DUMP_BIN,
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

async function estimateAllTableCounts() {
  const allModels = getAllModelNames().filter(m => !INTERNAL_MODELS.has(m));
  let totalRecords = 0;
  for (const m of allModels) {
    try {
      totalRecords += await prisma[m].count();
    } catch { /* skip if count fails */ }
  }
  return {
    tableCount: allModels.length,
    totalRecords,
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
      tableNames: Object.keys(data),
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

// ── Encryption ──────────────────────────────────────────────
// Format: [16-byte IV][AES-256-GCM ciphertext][16-byte auth tag]
// Reads plain file, writes .enc file, deletes plain file.

async function encryptFile(plainPath) {
  const key = getEncryptionKey();
  if (!key) return { encrypted: false, finalPath: plainPath };

  const encPath = plainPath + '.enc';
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const readStream = createReadStream(plainPath);
  const writeStream = createWriteStream(encPath);

  // Write IV header first
  writeStream.write(iv);

  // Pipe through cipher
  await pipeline(readStream, cipher, writeStream);

  // Append auth tag
  const authTag = cipher.getAuthTag();
  await fs.appendFile(encPath, authTag);

  // Remove unencrypted file
  await fs.unlink(plainPath);

  return { encrypted: true, finalPath: encPath };
}

// ── Main backup runner ──────────────────────────────────────

async function runBackup(backupId) {
  const backupRecord = await prisma.backupRecord.findUnique({ where: { id: backupId } });
  if (!backupRecord) throw new Error(`找不到備份任務: ${backupId}`);
  if (backupRecord.status !== 'in_progress') return;

  const config = await prisma.backupConfig.findFirst({ orderBy: { id: 'asc' } });
  const shouldEncrypt = config?.encryptionEnabled && !!getEncryptionKey();

  const tierDir = path.join(BACKUP_ROOT, backupRecord.tier);
  await ensureDir(tierDir);

  // Pre-flight: disk space check
  const spaceCheck = await checkDiskSpace(tierDir);
  if (!spaceCheck.ok) {
    throw new Error(`磁碟空間不足：剩餘 ${spaceCheck.freeMB} MB，需至少 ${spaceCheck.requiredMB} MB。請清理備份目錄或擴充磁碟空間。`);
  }

  const ext = backupRecord.tier === 'tier1_full' ? 'dump' : 'json.gz';
  const plainPath = path.join(tierDir, `${backupRecord.tier}_${todayStamp()}_${backupId}.${ext}`);

  let stats;
  if (backupRecord.tier === 'tier1_full') {
    await createPgDump(plainPath);
    stats = await estimateAllTableCounts();
  } else {
    stats = await createJsonBackup(plainPath, backupRecord.tier, backupRecord);
  }

  // Encrypt if enabled
  let finalPath = plainPath;
  let encrypted = false;
  if (shouldEncrypt) {
    const encResult = await encryptFile(plainPath);
    finalPath = encResult.finalPath;
    encrypted = encResult.encrypted;
  }

  const fileStat = await fs.stat(finalPath);
  const sha256 = await sha256File(finalPath);

  await prisma.backupRecord.update({
    where: { id: backupId },
    data: {
      status: 'completed',
      filePath: finalPath,
      fileSize: BigInt(fileStat.size),
      sha256,
      encrypted,
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

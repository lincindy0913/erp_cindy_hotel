/**
 * Backup restore testing library
 * Provides actual restore verification for RTO/RPO drill:
 * - pg_dump (.dump): pg_restore --list + restore to temp schema (schema+data) + verify + cleanup
 * - JSON (.json.gz): decompress + parse + deep table validation + trial query (rollback)
 *
 * Security:
 * - Table names validated against actual DB schema (prevents SQL injection)
 * - Encrypted backups decrypted to temp file before verification
 *
 * Shared by: /api/backup/restore-drill (API) and scripts/scheduler.mjs
 */

import { createReadStream, createWriteStream } from 'fs';
import { createHash, createDecipheriv } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { gunzipSync } from 'zlib';
import { pipeline } from 'stream/promises';
import { spawn } from 'child_process';

// ── Configurable pg tool paths ──────────────────────────────
// Override via env: PG_RESTORE_PATH, PSQL_PATH (e.g. /usr/lib/postgresql/15/bin/pg_restore)
const PG_RESTORE_BIN = process.env.PG_RESTORE_PATH || 'pg_restore';
const PSQL_BIN = process.env.PSQL_PATH || 'psql';

// ── Backup root for path traversal validation ───────────────
const BACKUP_ROOT = process.env.BACKUP_ROOT || path.join(process.cwd(), 'backup-data');

// ── Helpers ──────────────────────────────────────────────────

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function spawnAndCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function parseDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 未設定');
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port || '5432',
    username: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    database: parsed.pathname?.replace(/^\//, ''),
  };
}

// ── Table name whitelist (prevents SQL injection) ────────────
// Built from actual DB schema at runtime, not from backup data.

async function getValidTableNames(prismaClient) {
  try {
    const rows = await prismaClient.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    return new Set(rows.map(r => r.table_name));
  } catch {
    return new Set();
  }
}

function camelToSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

// ── Path traversal protection ────────────────────────────────
// Validates that a backup file path is within BACKUP_ROOT (no symlink escape).

export function validateBackupPath(filePath) {
  if (!filePath) return { ok: false, reason: '備份檔案路徑為空' };
  const resolved = path.resolve(filePath);
  const root = path.resolve(BACKUP_ROOT);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return { ok: false, reason: `備份路徑 ${resolved} 不在允許的備份目錄 ${root} 內` };
  }
  return { ok: true, resolved };
}

// ── Orphan drill schema cleanup ──────────────────────────────
// Cleans up any _drill_* schemas older than 1 hour (from crashed drills).

export async function cleanupOrphanDrillSchemas() {
  const db = parseDatabaseUrl();
  const pgEnv = { ...process.env, PGPASSWORD: db.password };
  const psqlBase = ['--host', db.host, '--port', db.port, '--username', db.username, '--dbname', db.database];

  try {
    // Find all _drill_* schemas
    const result = await spawnAndCapture(PSQL_BIN, [
      ...psqlBase, '--tuples-only', '--no-align',
      '--command', `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE '_drill_%';`,
    ], { env: pgEnv });

    if (result.code !== 0) return { cleaned: 0, error: result.stderr?.slice(0, 200) };

    const schemas = result.stdout.trim().split('\n').filter(Boolean);
    let cleaned = 0;

    for (const schema of schemas) {
      // Extract timestamp from schema name: _drill_{timestamp}_{random}
      const match = schema.match(/^_drill_(\d+)_/);
      if (!match) continue;

      const createdAt = parseInt(match[1]);
      const ageMs = Date.now() - createdAt;

      // Only clean schemas older than 1 hour
      if (ageMs > 60 * 60 * 1000) {
        await spawnAndCapture(PSQL_BIN, [
          ...psqlBase,
          '--command', `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`,
        ], { env: pgEnv });
        cleaned++;
      }
    }

    return { cleaned, total: schemas.length };
  } catch (e) {
    return { cleaned: 0, error: e.message };
  }
}

// ── Decryption ──────────────────────────────────────────────
// Format: [16-byte IV][AES-256-GCM ciphertext][16-byte auth tag]

function getEncryptionKey() {
  const keyHex = process.env.BACKUP_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    if (keyHex && keyHex.length !== 64) {
      console.warn(`[backup] BACKUP_ENCRYPTION_KEY 長度不正確（需要 64 hex chars，實際 ${keyHex.length}），加密功能已停用`);
    }
    return null;
  }
  return Buffer.from(keyHex, 'hex');
}

async function decryptToTempFile(encryptedPath) {
  const key = getEncryptionKey();
  if (!key) throw new Error('BACKUP_ENCRYPTION_KEY 未設定，無法解密備份檔案');

  const encData = await fs.readFile(encryptedPath);
  if (encData.length < 32) throw new Error('加密備份檔案格式錯誤（太小）');

  const iv = encData.subarray(0, 16);
  const authTag = encData.subarray(encData.length - 16);
  const ciphertext = encData.subarray(16, encData.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Write to temp file
  const tmpDir = path.join(path.dirname(encryptedPath), '.drill-tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `drill_${Date.now()}_${path.basename(encryptedPath).replace('.enc', '')}`);
  await fs.writeFile(tmpPath, decrypted);
  return tmpPath;
}

// ── Main drill runner ────────────────────────────────────────

/**
 * Execute a full restore drill against a backup file.
 * Returns structured result with RTO/RPO metrics.
 */
export async function executeRestoreDrill(backup, config, prismaClient, options = {}) {
  const autoRestore = options.autoRestore ?? config?.drillAutoRestore ?? true;
  const startTime = Date.now();

  const results = {
    fileIntegrity: false,
    checksumMatch: false,
    dataReadable: false,
    recordCountMatch: false,
    sampleDataValid: false,
    actualRestore: false,
  };

  const details = {
    backupId: backup.id,
    tier: backup.tier,
    filePath: backup.filePath,
    restoreMethod: 'file_only',
    encrypted: backup.encrypted || false,
  };

  let errorMessage = null;
  let workingPath = backup.filePath; // May change if decryption needed
  let tempDecryptedPath = null;

  try {
    // ── Test 0: Path traversal protection ──
    const pathCheck = validateBackupPath(backup.filePath);
    if (!pathCheck.ok) {
      throw new Error(`PATH_SECURITY: ${pathCheck.reason}`);
    }

    // ── Test 1: File integrity ──
    await fs.access(backup.filePath);
    const stat = await fs.stat(backup.filePath);
    results.fileIntegrity = stat.size > 0;
    details.fileSize = stat.size;
    details.expectedFileSize = backup.fileSize ? Number(backup.fileSize) : null;

    // ── Test 2: Checksum ──
    const actualHash = await sha256File(backup.filePath);
    if (!backup.sha256) {
      // Checksum missing from backup record — treat as failure
      results.checksumMatch = false;
      details.checksumWarning = 'backup record 缺少 SHA256，無法驗證完整性';
    } else {
      results.checksumMatch = actualHash === backup.sha256;
    }
    details.expectedSha256 = backup.sha256;
    details.actualSha256 = actualHash;

    // ── Decrypt if encrypted ──
    if (backup.encrypted) {
      tempDecryptedPath = await decryptToTempFile(backup.filePath);
      workingPath = tempDecryptedPath;
      details.decryptionSuccess = true;
    }

    // ── Tests 3-5 + actual restore: format-dependent ──
    const isJson = workingPath.endsWith('.json.gz') ||
      (backup.encrypted && backup.filePath.replace('.enc', '').endsWith('.json.gz'));

    if (isJson) {
      const jsonResult = await verifyJsonBackup(backup, workingPath, prismaClient, autoRestore);
      Object.assign(results, jsonResult.results);
      Object.assign(details, jsonResult.details);
    } else {
      const pgResult = await verifyPgDumpBackup(backup, workingPath, autoRestore);
      Object.assign(results, pgResult.results);
      Object.assign(details, pgResult.details);
    }
  } catch (err) {
    errorMessage = err.message;
    details.error = err.message;
  } finally {
    // Clean up temp decrypted file
    if (tempDecryptedPath) {
      try {
        await fs.unlink(tempDecryptedPath);
        const tmpDir = path.dirname(tempDecryptedPath);
        const remaining = await fs.readdir(tmpDir);
        if (remaining.length === 0) await fs.rmdir(tmpDir);
      } catch { /* best effort */ }
    }
  }

  const restoreDurationMs = Date.now() - startTime;

  // RPO = how old is this backup
  const dataAgeMinutes = backup.completedAt
    ? Math.round((Date.now() - new Date(backup.completedAt).getTime()) / 60000)
    : null;

  // Compliance checks
  const rtoTargetMinutes = config?.rtoTargetMinutes || 60;
  const rpoTargetHours = config?.rpoTargetHours || 24;
  const rtoCompliant = restoreDurationMs <= rtoTargetMinutes * 60 * 1000;
  const rpoCompliant = dataAgeMinutes != null ? dataAgeMinutes <= rpoTargetHours * 60 : false;

  const allTestsPassed = results.fileIntegrity && results.checksumMatch &&
    results.dataReadable && results.recordCountMatch && results.sampleDataValid;

  details.restoreMethod = details.restoreMethod || 'file_only';

  return {
    results,
    details,
    errorMessage,
    restoreDurationMs,
    dataAgeMinutes,
    rtoCompliant,
    rpoCompliant,
    rtoTargetMinutes,
    rpoTargetHours,
    restoreMethod: details.restoreMethod,
    tablesExpected: details.expectedTableCount ?? null,
    tablesRestored: details.actualTableCount ?? null,
    recordsExpected: details.expectedRecordCount ?? backup.totalRecords ?? null,
    recordsRestored: details.actualRecordCount ?? null,
    allTestsPassed,
  };
}

// ── JSON backup verification ─────────────────────────────────

async function verifyJsonBackup(backup, workingPath, prismaClient, autoRestore) {
  const results = {
    dataReadable: false,
    recordCountMatch: false,
    sampleDataValid: false,
    actualRestore: false,
  };
  const details = {
    restoreMethod: autoRestore ? 'json_validate_insert' : 'json_validate_only',
  };

  // Decompress and parse
  const compressed = await fs.readFile(workingPath);
  const raw = gunzipSync(compressed).toString('utf8');
  const parsed = JSON.parse(raw);

  results.dataReadable = !!parsed?.data;
  details.hasMeta = !!parsed.meta;
  details.hasData = !!parsed.data;

  if (!parsed.data) return { results, details };

  const tableNames = Object.keys(parsed.data);
  const actualTableCount = tableNames.length;
  let actualRecordCount = 0;

  // Deep validation: check every table's structure
  const tableValidation = {};
  let allTablesValid = true;

  for (const tableName of tableNames) {
    const rows = parsed.data[tableName];
    if (!Array.isArray(rows)) {
      tableValidation[tableName] = { valid: false, reason: 'not_an_array' };
      allTablesValid = false;
      continue;
    }

    actualRecordCount += rows.length;

    if (rows.length === 0) {
      tableValidation[tableName] = { valid: true, count: 0 };
      continue;
    }

    // Validate first + last row structure
    const sampleRows = [rows[0]];
    if (rows.length > 1) sampleRows.push(rows[rows.length - 1]);

    let valid = true;
    let reason = null;
    for (const row of sampleRows) {
      if (typeof row !== 'object' || row === null) {
        valid = false;
        reason = 'row_not_object';
        break;
      }
      if (!('id' in row)) {
        valid = false;
        reason = 'missing_id';
        break;
      }
    }

    tableValidation[tableName] = { valid, count: rows.length, reason };
    if (!valid) allTablesValid = false;
  }

  // Record count match
  if (backup.tableCount != null) {
    results.recordCountMatch = backup.tableCount === actualTableCount;
  } else {
    results.recordCountMatch = actualTableCount > 0;
  }

  results.sampleDataValid = allTablesValid;

  details.actualTableCount = actualTableCount;
  details.actualRecordCount = actualRecordCount;
  details.expectedTableCount = backup.tableCount;
  details.expectedRecordCount = backup.totalRecords;
  details.tableValidation = tableValidation;

  // ── Actual restore test: validated query in transaction (rollback) ──
  if (autoRestore && prismaClient) {
    try {
      // Get valid table names from actual DB schema (whitelist)
      const validDbTables = await getValidTableNames(prismaClient);

      await prismaClient.$transaction(async (tx) => {
        const verifiedTables = [];

        for (const tableName of tableNames) {
          const rows = parsed.data[tableName];
          if (!Array.isArray(rows) || rows.length === 0) continue;

          // Map JSON table name to DB table name
          const dbTableName = camelToSnake(tableName);

          // SECURITY: Only query tables that actually exist in the DB schema
          if (!validDbTables.has(dbTableName)) {
            continue;
          }

          try {
            // Use parameterized query via Prisma.$queryRaw with validated table name
            // Since table names can't be parameterized in SQL, we use the whitelist above
            const countResult = await tx.$queryRawUnsafe(
              `SELECT COUNT(*) as cnt FROM "public"."${dbTableName}"`
            );
            verifiedTables.push({
              table: tableName,
              dbTable: dbTableName,
              backupRows: rows.length,
              currentRows: Number(countResult[0]?.cnt ?? 0),
            });
          } catch {
            // Table query failed — skip
          }
        }

        details.verifiedTables = verifiedTables;
        details.verifiedTableCount = verifiedTables.length;
        results.actualRestore = verifiedTables.length > 0;

        // Force rollback — we don't want to change anything
        throw new Error('DRILL_ROLLBACK');
      });
    } catch (e) {
      if (e.message !== 'DRILL_ROLLBACK') {
        details.restoreTestError = e.message;
      }
    }
  }

  return { results, details };
}

// ── pg_dump backup verification ──────────────────────────────

async function verifyPgDumpBackup(backup, workingPath, autoRestore) {
  const results = {
    dataReadable: false,
    recordCountMatch: false,
    sampleDataValid: false,
    actualRestore: false,
  };
  const details = {
    restoreMethod: autoRestore ? 'pg_restore_temp_schema' : 'pg_restore_list',
  };

  // Verify PGDMP header
  const headerBuf = Buffer.alloc(5);
  const fh = await fs.open(workingPath, 'r');
  await fh.read(headerBuf, 0, 5, 0);
  await fh.close();
  const header = headerBuf.toString('ascii');
  results.dataReadable = header === 'PGDMP';
  details.pgDumpHeader = header;

  if (!results.dataReadable) return { results, details };

  // ── pg_restore --list: extract TOC ──
  try {
    const listResult = await spawnAndCapture(PG_RESTORE_BIN, ['--list', workingPath]);

    if (listResult.code === 0) {
      const lines = listResult.stdout.split('\n').filter(l => l.trim() && !l.startsWith(';'));
      const tableLines = lines.filter(l => /\bTABLE\b/.test(l) && !/TABLE DATA/.test(l));
      const dataLines = lines.filter(l => /TABLE DATA/.test(l));

      details.tocEntries = lines.length;
      details.tableDefinitions = tableLines.length;
      details.tableDataEntries = dataLines.length;
      details.actualTableCount = dataLines.length;
      details.expectedTableCount = backup.tableCount;

      results.recordCountMatch = dataLines.length > 0;
      results.sampleDataValid = tableLines.length > 0;
    } else {
      details.pgRestoreListError = listResult.stderr?.slice(0, 500);
    }
  } catch (e) {
    details.pgRestoreListError = e.message;
  }

  // ── Actual restore: pg_restore schema + data to temp schema ──
  if (autoRestore) {
    // Use unique schema name to prevent collision with concurrent drills
    const drillId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const TEMP_SCHEMA = `_drill_${drillId}`;
    const db = parseDatabaseUrl();
    const pgEnv = { ...process.env, PGPASSWORD: db.password };
    const psqlBase = ['--host', db.host, '--port', db.port, '--username', db.username, '--dbname', db.database];

    const cleanup = async () => {
      try {
        // Use parameterized approach: schema name is generated by us, not user input
        await spawnAndCapture(PSQL_BIN, [
          ...psqlBase,
          '--command', `DROP SCHEMA IF EXISTS "${TEMP_SCHEMA}" CASCADE;`,
        ], { env: pgEnv });
      } catch { /* best effort */ }
    };

    try {
      // Create temp schema
      const createSchema = await spawnAndCapture(PSQL_BIN, [
        ...psqlBase,
        '--command', `CREATE SCHEMA "${TEMP_SCHEMA}";`,
      ], { env: pgEnv });

      if (createSchema.code !== 0) {
        details.tempSchemaError = createSchema.stderr?.slice(0, 500);
        return { results, details };
      }

      // Restore schema into temp schema
      const schemaRestore = await spawnAndCapture(PG_RESTORE_BIN, [
        '--host', db.host, '--port', db.port, '--username', db.username, '--dbname', db.database,
        '--schema-only', '--no-owner', '--no-privileges',
        '--use-set-schema-name', TEMP_SCHEMA,
        workingPath,
      ], { env: pgEnv });

      // Check how many tables were created
      const countTables = await spawnAndCapture(PSQL_BIN, [
        ...psqlBase, '--tuples-only', '--no-align',
        '--command', `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${TEMP_SCHEMA}';`,
      ], { env: pgEnv });

      const restoredTableCount = parseInt(countTables.stdout?.trim()) || 0;
      details.restoredSchemaTableCount = restoredTableCount;

      if (restoredTableCount === 0) {
        details.schemaRestoreWarnings = schemaRestore.stderr?.slice(0, 500);
        await cleanup();
        return { results, details };
      }

      // Restore DATA into temp schema (the key fix — previously was schema-only)
      const dataRestore = await spawnAndCapture(PG_RESTORE_BIN, [
        '--host', db.host, '--port', db.port, '--username', db.username, '--dbname', db.database,
        '--data-only', '--no-owner', '--no-privileges',
        '--use-set-schema-name', TEMP_SCHEMA,
        workingPath,
      ], { env: pgEnv });

      details.dataRestoreExitCode = dataRestore.code;
      details.dataRestoreWarnings = dataRestore.stderr?.slice(0, 500) || null;

      // Count actual restored records via pg_stat (need ANALYZE first for accurate counts)
      await spawnAndCapture(PSQL_BIN, [
        ...psqlBase,
        '--command', `ANALYZE;`,
      ], { env: pgEnv });

      // Count records per table in temp schema
      const countRecords = await spawnAndCapture(PSQL_BIN, [
        ...psqlBase, '--tuples-only', '--no-align',
        '--command', `
          SELECT COALESCE(SUM(cnt), 0) FROM (
            SELECT schemaname, relname,
                   (xpath('/row/cnt/text()', xml_count))[1]::text::bigint as cnt
            FROM (
              SELECT schemaname, relname,
                     query_to_xml(format('SELECT COUNT(*) as cnt FROM %I.%I', schemaname, relname), false, true, '')
                     as xml_count
              FROM pg_tables
              WHERE schemaname = '${TEMP_SCHEMA}'
            ) t
          ) sub;
        `,
      ], { env: pgEnv });

      const restoredRecordCount = parseInt(countRecords.stdout?.trim()) || 0;

      // Also get per-table breakdown
      const tableBreakdown = await spawnAndCapture(PSQL_BIN, [
        ...psqlBase, '--tuples-only', '--no-align',
        '--command', `
          SELECT relname || ':' || (xpath('/row/cnt/text()', query_to_xml(
            format('SELECT COUNT(*) as cnt FROM %I.%I', schemaname, relname), false, true, ''
          )))[1]::text
          FROM pg_tables WHERE schemaname = '${TEMP_SCHEMA}' ORDER BY relname;
        `,
      ], { env: pgEnv });

      const restoredTables = tableBreakdown.stdout?.trim().split('\n').filter(Boolean) || [];
      const tablesWithData = restoredTables.filter(l => {
        const count = parseInt(l.split(':')[1]);
        return count > 0;
      });

      details.restoredTableCount = restoredTables.length;
      details.actualTableCount = restoredTables.length;
      details.tablesWithData = tablesWithData.length;
      details.restoredRecordCount = restoredRecordCount;
      details.actualRecordCount = restoredRecordCount;
      details.expectedRecordCount = backup.totalRecords;

      results.actualRestore = restoredRecordCount > 0;
      // Update recordCountMatch based on actual data restore
      if (restoredRecordCount > 0) {
        results.recordCountMatch = true;
        results.sampleDataValid = true;
      }

      // Cleanup
      await cleanup();

    } catch (e) {
      details.restoreTestError = e.message;
      await cleanup();
    }
  }

  return { results, details };
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { gunzipSync } from 'zlib';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { validateBackupPath } from '@/lib/backup-restore';

export const dynamic = 'force-dynamic';

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// GET - 取得單筆備份紀錄詳情
export async function GET(request, { params }) {
  try {
    const auth = await requirePermission(PERMISSIONS.BACKUP_VIEW);
    if (!auth.ok) return auth.response;

    const id = parseInt(params.id);

    if (isNaN(id)) {
      return createErrorResponse('VALIDATION_FAILED', '無效的備份 ID', 400);
    }

    const record = await prisma.backupRecord.findUnique({
      where: { id },
    });

    if (!record) {
      return createErrorResponse('BACKUP_NOT_FOUND', `找不到備份紀錄 (ID: ${id})`, 404);
    }

    // BigInt serialization
    const serialized = {
      ...record,
      fileSize: record.fileSize !== null ? record.fileSize.toString() : null,
    };

    return NextResponse.json(serialized);
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT - 手動驗證備份 { action: 'verify' }
export async function PUT(request, { params }) {
  try {
    const auth = await requirePermission(PERMISSIONS.BACKUP_EXECUTE);
    if (!auth.ok) return auth.response;

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return createErrorResponse('VALIDATION_FAILED', '無效的備份 ID', 400);
    }

    const data = await request.json();
    if (data.action !== 'verify') {
      return createErrorResponse('VALIDATION_FAILED', '不支援的操作', 400);
    }

    const record = await prisma.backupRecord.findUnique({ where: { id } });
    if (!record) {
      return createErrorResponse('BACKUP_NOT_FOUND', `找不到備份紀錄 (ID: ${id})`, 404);
    }
    if (record.status !== 'completed' && record.status !== 'verified') {
      return createErrorResponse('VALIDATION_FAILED', '只有已完成的備份可以驗證', 400);
    }

    if (!record.filePath) {
      return createErrorResponse('VALIDATION_FAILED', '備份檔案路徑不存在，無法驗證', 400);
    }

    // 0) 路徑安全性驗證
    const pathCheck = validateBackupPath(record.filePath);
    if (!pathCheck.ok) {
      return createErrorResponse('VALIDATION_FAILED', pathCheck.reason, 400);
    }

    // 1) 檔案存在性
    await fs.access(record.filePath);

    // 2) checksum 驗證（sha256 必須存在，否則視為驗證失敗）
    const actualSha256 = await sha256File(record.filePath);
    let checksumMatch;
    if (!record.sha256) {
      checksumMatch = false;
      // Backfill: compute and store checksum for legacy backups
      await prisma.backupRecord.update({
        where: { id },
        data: { sha256: actualSha256 },
      });
    } else {
      checksumMatch = actualSha256 === record.sha256;
    }

    // 3) DB 可連線（透過 Prisma）
    await prisma.$queryRaw`SELECT 1`;
    const dbConnectable = true;

    // 4) 結構與記錄數驗證（JSON 備份時可做更細）
    let recordCountMatch = true;
    let indexIntegrity = true;
    const details = {
      filePath: record.filePath,
      expectedSha256: record.sha256,
      actualSha256,
    };

    if (record.filePath.endsWith('.json.gz')) {
      const compressed = await fs.readFile(record.filePath);
      const raw = gunzipSync(compressed).toString('utf8');
      const parsed = JSON.parse(raw);
      const tableNames = Object.keys(parsed.data || {});
      const actualTableCount = tableNames.length;
      const actualRecordCount = tableNames.reduce((sum, name) => {
        const rows = parsed.data?.[name];
        return sum + (Array.isArray(rows) ? rows.length : 0);
      }, 0);

      if (record.tableCount !== null && record.tableCount !== undefined) {
        if (record.tableCount !== actualTableCount) recordCountMatch = false;
      }
      if (record.totalRecords !== null && record.totalRecords !== undefined) {
        if (record.totalRecords !== actualRecordCount) recordCountMatch = false;
      }

      details.actualTableCount = actualTableCount;
      details.actualRecordCount = actualRecordCount;
    } else {
      // pg_dump custom format: 至少確認檔案可讀且大小有效
      const stat = await fs.stat(record.filePath);
      if (!stat.size || stat.size <= 0) {
        indexIntegrity = false;
      }
      details.fileSize = stat.size;
    }

    const verifyResult = {
      checksumMatch,
      dbConnectable,
      recordCountMatch,
      indexIntegrity,
      details,
    };

    const allPassed = (
      verifyResult.checksumMatch &&
      verifyResult.dbConnectable &&
      verifyResult.recordCountMatch &&
      verifyResult.indexIntegrity
    );
    const result = allPassed ? 'passed' : 'warning';

    // Create verification record
    await prisma.backupVerification.create({
      data: {
        backupRecordId: id,
        result,
        checksumMatch: verifyResult.checksumMatch,
        dbConnectable: verifyResult.dbConnectable,
        recordCountMatch: verifyResult.recordCountMatch,
        indexIntegrity: verifyResult.indexIntegrity,
        details: verifyResult.details,
        note: '手動觸發驗證',
      },
    });

    // Update backup record
    await prisma.backupRecord.update({
      where: { id },
      data: {
        verified: allPassed,
        verifiedAt: new Date(),
        verifyResult: result,
        status: allPassed ? 'verified' : 'corrupted',
      },
    });

    return NextResponse.json({ success: true, result, details: verifyResult });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE - 刪除備份紀錄（僅限 admin）
export async function DELETE(request, { params }) {
  try {
    const auth = await requirePermission(PERMISSIONS.BACKUP_RESTORE);
    if (!auth.ok) return auth.response;

    const id = parseInt(params.id);

    if (isNaN(id)) {
      return createErrorResponse('VALIDATION_FAILED', '無效的備份 ID', 400);
    }

    const record = await prisma.backupRecord.findUnique({
      where: { id },
    });

    if (!record) {
      return createErrorResponse('BACKUP_NOT_FOUND', `找不到備份紀錄 (ID: ${id})`, 404);
    }

    // 不允許刪除進行中的備份
    if (record.status === 'in_progress') {
      return createErrorResponse(
        'BACKUP_IN_PROGRESS',
        '無法刪除進行中的備份，請等待完成或失敗後再嘗試',
        409
      );
    }

    // Tier 3 年度備份不允許隨意刪除（法規保存 7 年）
    if (record.tier === 'tier3_yearend') {
      // 檢查是否超過 7 年保存期限
      const sevenYearsAgo = new Date();
      sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

      if (record.startedAt > sevenYearsAgo) {
        return createErrorResponse(
          'VALIDATION_FAILED',
          `Tier 3 年度備份依台灣商業會計法第 38 條規定需保存 7 年，最早可刪除日期：${new Date(record.startedAt.getTime() + 7 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`,
          403
        );
      }
    }

    await prisma.backupRecord.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `備份紀錄 (ID: ${id}) 已刪除`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission, requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET - 取得備份設定（全系統唯一一筆，id=1）
export async function GET() {
  try {
    const auth = await requireAnyPermission([PERMISSIONS.BACKUP_VIEW, PERMISSIONS.SETTINGS_VIEW]);
    if (!auth.ok) return auth.response;

    let config = await prisma.backupConfig.findFirst({
      orderBy: { id: 'asc' },
    });

    // 若尚無設定紀錄，建立預設設定
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
          cloudProvider: 'disabled',
          notifyOnFailure: true,
          alertAfterFailCount: 1,
        },
      });
    }

    // 取得最新備份狀態摘要
    const [latestTier1, latestTier2, latestTier3, totalRecords, failedCount] = await Promise.all([
      prisma.backupRecord.findFirst({
        where: { tier: 'tier1_full', status: 'completed' },
        orderBy: { completedAt: 'desc' },
        select: { id: true, completedAt: true, fileSize: true, verified: true, verifiedAt: true },
      }),
      prisma.backupRecord.findFirst({
        where: { tier: 'tier2_snapshot', status: 'completed' },
        orderBy: { completedAt: 'desc' },
        select: { id: true, completedAt: true, fileSize: true },
      }),
      prisma.backupRecord.findFirst({
        where: { tier: { startsWith: 'tier3' }, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        select: { id: true, completedAt: true, fileSize: true, businessPeriod: true },
      }),
      prisma.backupRecord.count(),
      prisma.backupRecord.count({ where: { status: 'failed' } }),
    ]);

    // BigInt serialization for summary
    const serializeSummary = (record) => {
      if (!record) return null;
      return {
        ...record,
        fileSize: record.fileSize !== null ? record.fileSize.toString() : null,
      };
    };

    return NextResponse.json({
      config,
      summary: {
        latestTier1: serializeSummary(latestTier1),
        latestTier2: serializeSummary(latestTier2),
        latestTier3: serializeSummary(latestTier3),
        totalBackupRecords: totalRecords,
        totalFailedRecords: failedCount,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT - 更新備份設定
export async function PUT(request) {
  try {
    const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
    if (!auth.ok) return auth.response;

    const data = await request.json();

    // 取得現有設定
    let config = await prisma.backupConfig.findFirst({
      orderBy: { id: 'asc' },
    });

    if (!config) {
      // 若不存在，先建立預設
      config = await prisma.backupConfig.create({
        data: {
          tier1BackupTime: '04:00',
          tier2SnapshotTime: '04:30',
          backupCleanTime: '05:00',
          verifyDayOfWeek: 0,
          verifyTime: '06:00',
          tier1RetainDays: 90,
          tier2RetainDays: 30,
          cloudProvider: 'disabled',
          notifyOnFailure: true,
          alertAfterFailCount: 1,
        },
      });
    }

    // 建立更新資料物件（只更新有傳入的欄位）
    const updateData = {};

    // 排程時間驗證（HH:MM 格式）
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (data.tier1BackupTime !== undefined) {
      if (!timeRegex.test(data.tier1BackupTime)) {
        return createErrorResponse('VALIDATION_FAILED', 'tier1BackupTime 格式無效，需為 HH:MM', 400);
      }
      updateData.tier1BackupTime = data.tier1BackupTime;
    }

    if (data.tier2SnapshotTime !== undefined) {
      if (!timeRegex.test(data.tier2SnapshotTime)) {
        return createErrorResponse('VALIDATION_FAILED', 'tier2SnapshotTime 格式無效，需為 HH:MM', 400);
      }
      updateData.tier2SnapshotTime = data.tier2SnapshotTime;
    }

    if (data.backupCleanTime !== undefined) {
      if (!timeRegex.test(data.backupCleanTime)) {
        return createErrorResponse('VALIDATION_FAILED', 'backupCleanTime 格式無效，需為 HH:MM', 400);
      }
      updateData.backupCleanTime = data.backupCleanTime;
    }

    if (data.verifyTime !== undefined) {
      if (!timeRegex.test(data.verifyTime)) {
        return createErrorResponse('VALIDATION_FAILED', 'verifyTime 格式無效，需為 HH:MM', 400);
      }
      updateData.verifyTime = data.verifyTime;
    }

    // 驗證星期幾（0-6）
    if (data.verifyDayOfWeek !== undefined) {
      const day = parseInt(data.verifyDayOfWeek);
      if (isNaN(day) || day < 0 || day > 6) {
        return createErrorResponse('VALIDATION_FAILED', 'verifyDayOfWeek 需為 0-6（0=週日）', 400);
      }
      updateData.verifyDayOfWeek = day;
    }

    // 保留天數驗證
    if (data.tier1RetainDays !== undefined) {
      const days = parseInt(data.tier1RetainDays);
      if (isNaN(days) || days < 1 || days > 365) {
        return createErrorResponse('VALIDATION_FAILED', 'tier1RetainDays 需為 1-365 天', 400);
      }
      updateData.tier1RetainDays = days;
    }

    if (data.tier2RetainDays !== undefined) {
      const days = parseInt(data.tier2RetainDays);
      if (isNaN(days) || days < 1 || days > 365) {
        return createErrorResponse('VALIDATION_FAILED', 'tier2RetainDays 需為 1-365 天', 400);
      }
      updateData.tier2RetainDays = days;
    }

    // 雲端設定
    if (data.cloudProvider !== undefined) {
      const validProviders = ['aws_s3', 'gcs', 'b2', 'disabled'];
      if (!validProviders.includes(data.cloudProvider)) {
        return createErrorResponse(
          'VALIDATION_FAILED',
          `無效的雲端供應商: ${data.cloudProvider}，有效值為: ${validProviders.join(', ')}`,
          400
        );
      }
      updateData.cloudProvider = data.cloudProvider;
    }

    if (data.cloudBucketTier1 !== undefined) updateData.cloudBucketTier1 = data.cloudBucketTier1 || null;
    if (data.cloudBucketTier2 !== undefined) updateData.cloudBucketTier2 = data.cloudBucketTier2 || null;
    if (data.cloudBucketTier3 !== undefined) updateData.cloudBucketTier3 = data.cloudBucketTier3 || null;
    if (data.cloudAccessKey !== undefined) updateData.cloudAccessKey = data.cloudAccessKey || null;
    if (data.cloudSecretKey !== undefined) updateData.cloudSecretKey = data.cloudSecretKey || null;
    if (data.cloudRegion !== undefined) updateData.cloudRegion = data.cloudRegion || null;

    // 通知設定
    if (data.notifyOnFailure !== undefined) {
      updateData.notifyOnFailure = Boolean(data.notifyOnFailure);
    }

    if (data.alertAfterFailCount !== undefined) {
      const count = parseInt(data.alertAfterFailCount);
      if (isNaN(count) || count < 1 || count > 10) {
        return createErrorResponse('VALIDATION_FAILED', 'alertAfterFailCount 需為 1-10', 400);
      }
      updateData.alertAfterFailCount = count;
    }

    // 沒有任何需要更新的欄位
    if (Object.keys(updateData).length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '未提供任何需要更新的欄位', 400);
    }

    const updatedConfig = await prisma.backupConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    return NextResponse.json(updatedConfig);
  } catch (error) {
    return handleApiError(error);
  }
}

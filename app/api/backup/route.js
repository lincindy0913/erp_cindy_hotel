import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { spawn } from 'child_process';
import path from 'path';
import { requireAnyPermission, requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET - 取得備份紀錄列表（支援篩選：tier, status, 日期範圍）
export async function GET(request) {
  try {
    const auth = await requireAnyPermission([PERMISSIONS.BACKUP_VIEW, PERMISSIONS.SETTINGS_VIEW]);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const tier = searchParams.get('tier');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const triggerType = searchParams.get('triggerType');
    const page = parseInt(searchParams.get('page')) || 1;
    const pageSize = Math.min(parseInt(searchParams.get('pageSize')) || 50, 100);

    const where = {};

    if (tier) {
      where.tier = tier;
    }

    if (status) {
      where.status = status;
    }

    if (triggerType) {
      where.triggerType = triggerType;
    }

    // 日期範圍篩選（以 startedAt 為基準）
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) {
        where.startedAt.gte = new Date(startDate);
      }
      if (endDate) {
        // endDate 設為該日結束（23:59:59）
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.startedAt.lte = end;
      }
    }

    const [records, total] = await Promise.all([
      prisma.backupRecord.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.backupRecord.count({ where }),
    ]);

    // BigInt serialization: convert fileSize to string for JSON
    const serialized = records.map(r => ({
      ...r,
      fileSize: r.fileSize !== null ? r.fileSize.toString() : null,
    }));

    return NextResponse.json({
      data: serialized,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST - 建立新的備份紀錄並觸發備份流程
export async function POST(request) {
  try {
    const auth = await requirePermission(PERMISSIONS.BACKUP_EXECUTE);
    if (!auth.ok) return auth.response;

    const data = await request.json();

    // 驗證必要欄位
    if (!data.tier) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位: tier', 400);
    }

    const validTiers = ['tier1_full', 'tier2_snapshot', 'tier3_monthend', 'tier3_yearend'];
    if (!validTiers.includes(data.tier)) {
      return createErrorResponse(
        'VALIDATION_FAILED',
        `無效的備份層級: ${data.tier}，有效值為: ${validTiers.join(', ')}`,
        400
      );
    }

    // 全域鎖定：任何 tier 進行中時，不允許啟動新備份（避免同時跑 tier1+tier2 壓垮 DB）
    const inProgress = await prisma.backupRecord.findFirst({
      where: { status: 'in_progress' },
      select: { id: true, tier: true, startedAt: true },
    });

    if (inProgress) {
      // 超過 2 小時的 in_progress 視為卡住，自動標記為 failed
      const stuckThreshold = 2 * 60 * 60 * 1000;
      if (Date.now() - new Date(inProgress.startedAt).getTime() > stuckThreshold) {
        await prisma.backupRecord.update({
          where: { id: inProgress.id },
          data: { status: 'failed', errorMessage: '備份超時（逾 2 小時未完成），已自動標記為失敗', completedAt: new Date() },
        });
      } else {
        return createErrorResponse(
          'BACKUP_IN_PROGRESS',
          `已有進行中的備份 ${inProgress.tier}（ID: ${inProgress.id}），請等待完成後再執行`,
          409
        );
      }
    }

    const triggerType = data.triggerType || 'manual';
    const validTriggerTypes = ['scheduled', 'manual', 'month_end', 'year_end'];
    if (!validTriggerTypes.includes(triggerType)) {
      return createErrorResponse(
        'VALIDATION_FAILED',
        `無效的觸發方式: ${triggerType}`,
        400
      );
    }

    // 建立備份紀錄
    const backupRecord = await prisma.backupRecord.create({
      data: {
        tier: data.tier,
        triggerType,
        businessPeriod: data.businessPeriod || null,
        status: 'in_progress',
        createdBy: auth.session.user.email || auth.session.user.name || null,
        startedAt: new Date(),
      },
    });

    // 啟動背景 worker 執行真實備份流程
    const workerPath = path.join(process.cwd(), 'scripts', 'backup-worker.mjs');
    const child = spawn(process.execPath, [workerPath, String(backupRecord.id)], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();

    return NextResponse.json(
      {
        ...backupRecord,
        fileSize: backupRecord.fileSize !== null ? backupRecord.fileSize.toString() : null,
        message: '備份已啟動，正在背景執行中（真實備份流程）',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// 備份執行邏輯由 scripts/backup-worker.mjs 負責

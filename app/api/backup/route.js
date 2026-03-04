import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET - 取得備份紀錄列表（支援篩選：tier, status, 日期範圍）
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tier = searchParams.get('tier');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const triggerType = searchParams.get('triggerType');
    const page = parseInt(searchParams.get('page')) || 1;
    const pageSize = parseInt(searchParams.get('pageSize')) || 50;

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

    // 檢查是否有進行中的備份（同一 tier）
    const inProgress = await prisma.backupRecord.findFirst({
      where: {
        tier: data.tier,
        status: 'in_progress',
      },
    });

    if (inProgress) {
      return createErrorResponse(
        'BACKUP_IN_PROGRESS',
        `已有進行中的 ${data.tier} 備份（ID: ${inProgress.id}），請等待完成後再執行`,
        409
      );
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
        createdBy: data.createdBy || null,
        startedAt: new Date(),
      },
    });

    // 模擬備份流程（實際部署時會替換為真實的 pg_dump / JSON 匯出邏輯）
    // 非同步執行備份，不阻塞回應
    performBackup(backupRecord.id, data.tier).catch(err => {
      console.error(`備份執行失敗 (ID: ${backupRecord.id}):`, err);
    });

    return NextResponse.json(
      {
        ...backupRecord,
        fileSize: backupRecord.fileSize !== null ? backupRecord.fileSize.toString() : null,
        message: '備份已啟動，正在背景執行中',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// 非同步備份執行（模擬）
async function performBackup(backupId, tier) {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');

    // 根據 tier 決定備份路徑與行為
    let filePath;
    let estimatedSize;

    switch (tier) {
      case 'tier1_full':
        filePath = `/backup/db/full_${dateStr}.dump.gz`;
        estimatedSize = 500 * 1024 * 1024; // ~500MB
        break;
      case 'tier2_snapshot':
        filePath = `/backup/snapshot/snapshot_${dateStr}.json.gz`;
        estimatedSize = 50 * 1024 * 1024; // ~50MB
        break;
      case 'tier3_monthend':
        filePath = `/backup/export/monthly_${dateStr}.json.gz`;
        estimatedSize = 20 * 1024 * 1024; // ~20MB
        break;
      case 'tier3_yearend':
        filePath = `/backup/export/annual_${dateStr}.json.gz`;
        estimatedSize = 100 * 1024 * 1024; // ~100MB
        break;
      default:
        filePath = `/backup/unknown_${dateStr}`;
        estimatedSize = 0;
    }

    // 收集各資料表統計資訊
    let tableCount = 0;
    let totalRecords = 0;

    if (tier === 'tier1_full') {
      // Tier 1: 計算所有資料表的總筆數
      const counts = await Promise.all([
        prisma.product.count(),
        prisma.supplier.count(),
        prisma.purchaseMaster.count(),
        prisma.salesMaster.count(),
        prisma.cashAccount.count(),
        prisma.cashTransaction.count(),
      ]);
      tableCount = counts.length;
      totalRecords = counts.reduce((sum, c) => sum + c, 0);
    } else if (tier === 'tier2_snapshot') {
      // Tier 2: 快照快取資料表
      tableCount = 2;
      totalRecords = 0;
      // 嘗試計算快取資料表，如果模型存在的話
      try {
        const snapshotCounts = await Promise.all([
          prisma.accountMonthlySnapshot.count(),
          prisma.inventoryMonthlySnapshot.count(),
        ]);
        totalRecords = snapshotCounts.reduce((sum, c) => sum + c, 0);
      } catch {
        // 快取表可能不存在，忽略
      }
    } else if (tier === 'tier3_monthend' || tier === 'tier3_yearend') {
      // Tier 3: 業務資料匯出
      const counts = await Promise.all([
        prisma.purchaseMaster.count(),
        prisma.salesMaster.count(),
        prisma.cashTransaction.count(),
        prisma.product.count(),
        prisma.supplier.count(),
      ]);
      tableCount = counts.length;
      totalRecords = counts.reduce((sum, c) => sum + c, 0);
    }

    // 模擬 SHA256 校驗碼
    const sha256 = generateSimpleHash(`${tier}-${dateStr}-${totalRecords}`);

    // 更新備份紀錄為完成
    await prisma.backupRecord.update({
      where: { id: backupId },
      data: {
        status: 'completed',
        filePath,
        fileSize: BigInt(estimatedSize),
        sha256,
        tableCount,
        totalRecords,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    // 備份失敗，更新狀態
    console.error('備份流程錯誤:', error);
    await prisma.backupRecord.update({
      where: { id: backupId },
      data: {
        status: 'failed',
        errorMessage: error.message || '備份執行過程中發生未知錯誤',
        completedAt: new Date(),
      },
    });
  }
}

// 簡易雜湊產生（模擬 SHA256，實際部署請使用 crypto 模組）
function generateSimpleHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return hex.repeat(8).substring(0, 64);
}

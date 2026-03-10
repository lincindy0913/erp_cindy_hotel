import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 取得 PMS 付款方式設定（可選 ?warehouse=館別 篩選）
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.PMS_VIEW, PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse') ?? '';

    const configs = await prisma.pmsPaymentMethodConfig.findMany({
      where: warehouse === '' ? {} : { warehouse },
      orderBy: [{ warehouse: 'asc' }, { id: 'asc' }]
    });

    const result = configs.map(c => ({
      ...c,
      feePercentage: Number(c.feePercentage),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 新增或更新付款方式設定 (upsert by warehouse + pmsColumnName)
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.PMS_VIEW, PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    if (!data.pmsColumnName) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫PMS欄位名稱', 400);
    }

    const warehouse = data.warehouse != null ? String(data.warehouse).trim() : '';

    const upsertData = {
      cashAccountId: data.cashAccountId ? parseInt(data.cashAccountId) : null,
      settlementDelayDays: parseInt(data.settlementDelayDays) || 0,
      feePercentage: parseFloat(data.feePercentage) || 0,
      feeAccountingCode: data.feeAccountingCode || null,
      isActive: data.isActive !== undefined ? data.isActive : true,
      note: data.note || null
    };

    const result = await prisma.pmsPaymentMethodConfig.upsert({
      where: { warehouse_pmsColumnName: { warehouse, pmsColumnName: data.pmsColumnName } },
      update: upsertData,
      create: {
        warehouse,
        pmsColumnName: data.pmsColumnName,
        ...upsertData
      }
    });

    return NextResponse.json({
      ...result,
      feePercentage: Number(result.feePercentage),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT: 批次更新多筆設定（每筆可含 warehouse）
export async function PUT(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.PMS_VIEW, PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const { configs } = await request.json();

    if (!configs || !Array.isArray(configs)) {
      return createErrorResponse('VALIDATION_FAILED', '請提供設定陣列', 400);
    }

    const results = [];
    for (const cfg of configs) {
      if (!cfg.pmsColumnName) continue;

      const warehouse = cfg.warehouse != null ? String(cfg.warehouse).trim() : '';

      const upsertData = {
        cashAccountId: cfg.cashAccountId ? parseInt(cfg.cashAccountId) : null,
        settlementDelayDays: parseInt(cfg.settlementDelayDays) || 0,
        feePercentage: parseFloat(cfg.feePercentage) || 0,
        feeAccountingCode: cfg.feeAccountingCode || null,
        isActive: cfg.isActive !== undefined ? cfg.isActive : true,
        note: cfg.note || null
      };

      const result = await prisma.pmsPaymentMethodConfig.upsert({
        where: { warehouse_pmsColumnName: { warehouse, pmsColumnName: cfg.pmsColumnName } },
        update: upsertData,
        create: {
          warehouse,
          pmsColumnName: cfg.pmsColumnName,
          ...upsertData
        }
      });
      results.push(result);
    }

    return NextResponse.json({ success: true, count: results.length });
  } catch (error) {
    return handleApiError(error);
  }
}

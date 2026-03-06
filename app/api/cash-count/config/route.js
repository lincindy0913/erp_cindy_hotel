import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET /api/cash-count/config - Get all CashCountConfig records (one per cash account)
// Optional query param: ?accountId=X to get a single config
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CASH_COUNT_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (accountId) {
      // Return single config for a specific account
      const config = await prisma.cashCountConfig.findUnique({
        where: { accountId: parseInt(accountId) },
        include: {
          account: {
            select: { id: true, name: true, type: true, warehouse: true, isActive: true }
          }
        }
      });

      if (!config) {
        // If no config exists yet, return default values along with account info
        const account = await prisma.cashAccount.findUnique({
          where: { id: parseInt(accountId) },
          select: { id: true, name: true, type: true, warehouse: true, isActive: true }
        });

        if (!account) {
          return createErrorResponse('NOT_FOUND', '帳戶不存在', 404);
        }

        return NextResponse.json({
          id: null,
          accountId: account.id,
          countFrequency: 'daily',
          alertAfterDays: 1,
          shortageThreshold: 5000,
          requireDualReview: true,
          account,
          createdAt: null,
          updatedAt: null
        });
      }

      return NextResponse.json({
        ...config,
        shortageThreshold: Number(config.shortageThreshold),
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString()
      });
    }

    // Return all configs, one per cash-type account
    // First get all cash accounts
    const cashAccounts = await prisma.cashAccount.findMany({
      where: { type: '現金', isActive: true },
      select: { id: true, name: true, type: true, warehouse: true, isActive: true },
      orderBy: [{ warehouse: 'asc' }, { name: 'asc' }]
    });

    // Get existing configs
    const existingConfigs = await prisma.cashCountConfig.findMany({
      include: {
        account: {
          select: { id: true, name: true, type: true, warehouse: true, isActive: true }
        }
      }
    });

    const configMap = {};
    for (const c of existingConfigs) {
      configMap[c.accountId] = {
        ...c,
        shortageThreshold: Number(c.shortageThreshold),
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString()
      };
    }

    // Build result: merge existing configs with default values for accounts without config
    const result = cashAccounts.map(account => {
      if (configMap[account.id]) {
        return configMap[account.id];
      }
      return {
        id: null,
        accountId: account.id,
        countFrequency: 'daily',
        alertAfterDays: 1,
        shortageThreshold: 5000,
        requireDualReview: true,
        account,
        createdAt: null,
        updatedAt: null
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT /api/cash-count/config - Create or update CashCountConfig for an account
// Body: { accountId, countFrequency?, alertAfterDays?, shortageThreshold?, requireDualReview? }
export async function PUT(request) {
  const auth = await requirePermission(PERMISSIONS.CASH_COUNT_REVIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '帳戶 ID 為必填', 400);
    }

    const accountId = parseInt(data.accountId);

    // Validate account exists and is cash type
    const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return createErrorResponse('NOT_FOUND', '帳戶不存在', 404);
    }
    if (account.type !== '現金') {
      return createErrorResponse('CASH_COUNT_INVALID_ACCOUNT', '只有現金帳戶可設定盤點配置', 400);
    }

    // Validate fields
    const validFrequencies = ['daily', 'weekly', 'monthly', 'on_demand'];
    if (data.countFrequency && !validFrequencies.includes(data.countFrequency)) {
      return createErrorResponse(
        'VALIDATION_FAILED',
        `盤點頻率必須為 ${validFrequencies.join(', ')} 其中之一`,
        400
      );
    }

    if (data.alertAfterDays !== undefined && (parseInt(data.alertAfterDays) < 0)) {
      return createErrorResponse('VALIDATION_FAILED', '逾期提醒天數不可為負數', 400);
    }

    if (data.shortageThreshold !== undefined && (parseFloat(data.shortageThreshold) < 0)) {
      return createErrorResponse('VALIDATION_FAILED', '短缺審核門檻不可為負數', 400);
    }

    // Build update data
    const updateData = {};
    if (data.countFrequency !== undefined) updateData.countFrequency = data.countFrequency;
    if (data.alertAfterDays !== undefined) updateData.alertAfterDays = parseInt(data.alertAfterDays);
    if (data.shortageThreshold !== undefined) updateData.shortageThreshold = parseFloat(data.shortageThreshold);
    if (data.requireDualReview !== undefined) updateData.requireDualReview = data.requireDualReview;

    // Upsert: create if not exists, update if exists
    const config = await prisma.cashCountConfig.upsert({
      where: { accountId },
      create: {
        accountId,
        countFrequency: data.countFrequency || 'daily',
        alertAfterDays: data.alertAfterDays !== undefined ? parseInt(data.alertAfterDays) : 1,
        shortageThreshold: data.shortageThreshold !== undefined ? parseFloat(data.shortageThreshold) : 5000,
        requireDualReview: data.requireDualReview !== undefined ? data.requireDualReview : true
      },
      update: updateData,
      include: {
        account: {
          select: { id: true, name: true, type: true, warehouse: true, isActive: true }
        }
      }
    });

    return NextResponse.json({
      ...config,
      shortageThreshold: Number(config.shortageThreshold),
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

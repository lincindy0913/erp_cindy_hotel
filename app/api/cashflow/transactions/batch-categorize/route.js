import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// PATCH: 批量設定現金流交易的科目
// Body:
//   { categoryId, transactionIds }         — 指定 ID 列表
//   { categoryId, noCategoryOnly, type, warehouse, startDate, endDate }  — 依條件篩選
export async function PATCH(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const { categoryId } = data;

    // categoryId = null 表示清除科目
    if (categoryId !== null && categoryId !== undefined) {
      const cat = await prisma.cashCategory.findUnique({ where: { id: parseInt(categoryId) } });
      if (!cat) return createErrorResponse('NOT_FOUND', '找不到指定科目', 404);
    }

    const catIdValue = categoryId != null ? parseInt(categoryId) : null;

    let where = {};

    if (Array.isArray(data.transactionIds) && data.transactionIds.length > 0) {
      where.id = { in: data.transactionIds.map(Number) };
    } else {
      // 條件篩選模式
      if (data.noCategoryOnly) where.categoryId = null;
      if (data.type)       where.type = data.type;
      if (data.warehouse)  where.warehouse = data.warehouse;
      if (data.sourceType) where.sourceType = data.sourceType;
      if (data.startDate || data.endDate) {
        where.transactionDate = {};
        if (data.startDate) where.transactionDate.gte = data.startDate;
        if (data.endDate)   where.transactionDate.lte = data.endDate;
      }
      // 防止無條件全量更新
      const hasFilter = data.noCategoryOnly || data.type || data.warehouse || data.sourceType || data.startDate || data.endDate;
      if (!hasFilter) return createErrorResponse('VALIDATION_FAILED', '請指定 transactionIds 或至少一個篩選條件', 400);
    }

    const result = await prisma.cashTransaction.updateMany({
      where,
      data: { categoryId: catIdValue },
    });

    return NextResponse.json({ success: true, updatedCount: result.count });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET: 查詢未分類交易統計（供前端顯示提示）
export async function GET() {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const [noCategory, total] = await Promise.all([
      prisma.cashTransaction.count({ where: { categoryId: null, type: { not: '移轉' } } }),
      prisma.cashTransaction.count({ where: { type: { not: '移轉' } } }),
    ]);

    const bySourceType = await prisma.cashTransaction.groupBy({
      by: ['sourceType'],
      where: { categoryId: null, type: { not: '移轉' } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return NextResponse.json({
      noCategory,
      total,
      pct: total > 0 ? Math.round((noCategory / total) * 100) : 0,
      bySourceType: bySourceType.map(r => ({ sourceType: r.sourceType || '手動', count: r._count.id })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

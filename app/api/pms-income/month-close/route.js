import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 查詢月結狀態（warehouse + yearMonth）
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const yearMonth = searchParams.get('yearMonth');

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (yearMonth) where.yearMonth = yearMonth;

    const closes = await prisma.pmsMonthClose.findMany({
      where,
      orderBy: [{ yearMonth: 'desc' }, { warehouse: 'asc' }],
      take: 24,
    });

    return NextResponse.json(closes.map(c => ({
      ...c,
      cashTotal:    Number(c.cashTotal),
      wireTotal:    Number(c.wireTotal),
      ccTotal:      Number(c.ccTotal),
      depositIn:    Number(c.depositIn),
      depositOut:   Number(c.depositOut),
      otaTotal:     Number(c.otaTotal),
      totalRevenue: Number(c.totalRevenue),
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

const OTA_SOURCES = ['OTA-Booking', 'OTA-Agoda', 'OTA-Expedia', '攜程網', '易遊網'];

// POST: 計算並儲存月結草稿（或覆蓋既有草稿）
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { warehouse, yearMonth, note } = await request.json();
    if (!warehouse || !yearMonth) {
      return createErrorResponse('VALIDATION_FAILED', 'warehouse 和 yearMonth 為必填', 400);
    }

    // 現有月結若已鎖定，不允許覆蓋
    const existing = await prisma.pmsMonthClose.findUnique({
      where: { warehouse_yearMonth: { warehouse, yearMonth } },
    });
    if (existing?.status === 'locked') {
      return createErrorResponse('FORBIDDEN', '此月份已鎖定，如需解鎖請聯絡主管', 403);
    }

    // 從 PmsReservationRecord 彙總本月數字
    const rows = await prisma.pmsReservationRecord.findMany({
      where: { warehouse, businessDate: { startsWith: yearMonth } },
      select: {
        cash: true, wireTransfer: true, creditCard: true,
        depositIn: true, depositOut: true, totalRevenue: true,
        source: true, sourceOverride: true,
      },
    });

    let cashTotal = 0, wireTotal = 0, ccTotal = 0;
    let depositIn = 0, depositOut = 0, otaTotal = 0, totalRevenue = 0;
    const bySource = {};

    for (const r of rows) {
      cashTotal    += Number(r.cash);
      wireTotal    += Number(r.wireTransfer);
      ccTotal      += Number(r.creditCard);
      depositIn    += Number(r.depositIn);
      depositOut   += Number(r.depositOut);
      totalRevenue += Number(r.totalRevenue);

      const src = r.sourceOverride || r.source || '其他';
      if (OTA_SOURCES.includes(src)) otaTotal += Number(r.totalRevenue);

      bySource[src] = (bySource[src] || 0) + Number(r.totalRevenue);
    }

    const summary = {
      reservationCount: rows.length,
      bySource,
      generatedAt: new Date().toISOString(),
    };

    const data = {
      cashTotal, wireTotal, ccTotal,
      depositIn, depositOut, otaTotal, totalRevenue,
      summary,
      status: existing ? existing.status : 'draft',
      note: note ?? existing?.note ?? null,
    };

    const close = await prisma.pmsMonthClose.upsert({
      where: { warehouse_yearMonth: { warehouse, yearMonth } },
      create: { warehouse, yearMonth, ...data },
      update: { ...data, updatedAt: new Date() },
    });

    return NextResponse.json({
      ...close,
      cashTotal:    Number(close.cashTotal),
      wireTotal:    Number(close.wireTotal),
      ccTotal:      Number(close.ccTotal),
      depositIn:    Number(close.depositIn),
      depositOut:   Number(close.depositOut),
      otaTotal:     Number(close.otaTotal),
      totalRevenue: Number(close.totalRevenue),
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH: 更新月結狀態（確認 / 鎖定 / 解鎖 / 備註）
export async function PATCH(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { warehouse, yearMonth, status, note } = await request.json();
    if (!warehouse || !yearMonth) {
      return createErrorResponse('VALIDATION_FAILED', 'warehouse 和 yearMonth 為必填', 400);
    }

    const existing = await prisma.pmsMonthClose.findUnique({
      where: { warehouse_yearMonth: { warehouse, yearMonth } },
    });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '月結記錄不存在，請先執行月結計算', 404);
    }

    const updateData = {};
    if (status) {
      const valid = ['draft', 'confirmed', 'locked'];
      if (!valid.includes(status)) {
        return createErrorResponse('VALIDATION_FAILED', `status 必須為 ${valid.join('/')}`, 400);
      }
      updateData.status = status;
      if (status === 'confirmed' || status === 'locked') {
        updateData.closedAt = new Date();
        updateData.closedBy = auth.user?.email || auth.user?.name || null;
      }
    }
    if (note !== undefined) updateData.note = note;

    const updated = await prisma.pmsMonthClose.update({
      where: { warehouse_yearMonth: { warehouse, yearMonth } },
      data: updateData,
    });

    return NextResponse.json({
      ...updated,
      cashTotal:    Number(updated.cashTotal),
      wireTotal:    Number(updated.wireTotal),
      ccTotal:      Number(updated.ccTotal),
      depositIn:    Number(updated.depositIn),
      depositOut:   Number(updated.depositOut),
      otaTotal:     Number(updated.otaTotal),
      totalRevenue: Number(updated.totalRevenue),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
